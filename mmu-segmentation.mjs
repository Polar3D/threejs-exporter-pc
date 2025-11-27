// Utilities for encoding MMU paint segmentation strings compatible with Bambu Studio.
//
// ✅ ALGORITHM MATCH: This implementation exactly matches BambuStudio's approach:
//    1. Recursively subdivide triangles (max depth = 4)
//    2. Assign extruder IDs to vertices based on RGB color distance
//    3. Serialize using nibble packing (TriangleSelector::serialize format)
//    4. Convert to hexadecimal string for 3MF paint_color attribute
//
// ✅ EXTRUDER IDS: Uses 1-based indexing (1, 2, 3, ...) matching BambuStudio
// ✅ COLOR MATCHING: Euclidean distance in RGB space (linear color values)
//
// Triangles are recursively subdivided until each leaf is assigned a single extruder,
// then serialized using the same nibble packing as TriangleSelector::serialize.

/**
 * Encode a triangle's paint segmentation into the hexadecimal string format used by Bambu Studio.
 *
 * @param {Object} triangle - Triangle metadata produced by collectComponents.
 * @param {number|null|undefined} fallbackExtruder - Extruder id used when a vertex lacks paint data.
 * @param {Array<Object>} materialPalette - All materials discovered on the mesh (provides color + extruder).
 * @returns {string|null} Hex string representing the segmentation, or null if unavailable.
 */
export function encodePaintColor(triangle, fallbackExtruder, materialPalette) {
  if (
    !triangle ||
    !Array.isArray(triangle.vertexMaterials) ||
    triangle.vertexMaterials.length !== 3
  ) {
    return null;
  }

  if (
    !Array.isArray(triangle.vertexColors) ||
    triangle.vertexColors.length !== 3
  ) {
    return null;
  }

  const palette = Array.isArray(materialPalette)
    ? materialPalette
        .filter(Boolean)
        .map((mat) => ({
          extruder:
            mat && typeof mat.extruder === "number" ? mat.extruder : null,
          color:
            mat && mat.color
              ? { r: mat.color.r, g: mat.color.g, b: mat.color.b }
              : null,
        }))
        .filter((entry) => entry.extruder !== null && entry.color !== null)
    : [];

  if (palette.length === 0 && typeof fallbackExtruder !== "number") {
    return null;
  }

  const seedVertices = triangle.vertexColors.map((color, idx) => {
    const material = triangle.vertexMaterials[idx];
    const extruder =
      material && typeof material.extruder === "number"
        ? material.extruder
        : typeof fallbackExtruder === "number"
          ? fallbackExtruder
          : null;
    return {
      color,
      extruder,
    };
  });

  if (seedVertices.some((vert) => !vert.color)) {
    return null;
  }

  const paletteEntries = palette.length > 0 ? palette : [];
  const maxDepth = 4;

  function closestExtruder(color, extruderHints = []) {
    if (!color) {
      return typeof fallbackExtruder === "number" ? fallbackExtruder : null;
    }

    if (paletteEntries.length === 0) {
      return typeof fallbackExtruder === "number" ? fallbackExtruder : null;
    }

    let bestDistance = Infinity;
    let bestExtruders = [];

    // ✅ COLOR DISTANCE: Euclidean distance in RGB space (squared to avoid sqrt)
    // This matches BambuStudio's color matching algorithm
    // Colors are in linear space (0.0-1.0), not sRGB gamma-corrected
    for (const entry of paletteEntries) {
      const dr = entry.color.r - color.r;
      const dg = entry.color.g - color.g;
      const db = entry.color.b - color.b;
      const distance = dr * dr + dg * dg + db * db; // Squared Euclidean distance

      if (distance < bestDistance - 1e-8) {
        bestDistance = distance;
        bestExtruders = [entry.extruder];
      } else if (Math.abs(distance - bestDistance) <= 1e-8) {
        bestExtruders.push(entry.extruder);
      }
    }

    if (bestExtruders.length === 1) {
      return bestExtruders[0];
    }

    if (bestExtruders.length > 1) {
      const hintExtruders = extruderHints.filter(
        (value) => typeof value === "number",
      );
      if (hintExtruders.length > 0) {
        return majorityExtruder(hintExtruders);
      }
      return bestExtruders.sort((a, b) => a - b)[0];
    }

    return typeof fallbackExtruder === "number" ? fallbackExtruder : null;
  }

  function averageColor(a, b) {
    return {
      r: (a.r + b.r) / 2,
      g: (a.g + b.g) / 2,
      b: (a.b + b.b) / 2,
    };
  }

  function majorityExtruder(extruders) {
    const counts = new Map();
    let majority =
      typeof fallbackExtruder === "number"
        ? fallbackExtruder
        : (extruders.find((value) => typeof value === "number") ?? 0);
    let max = -1;

    for (const value of extruders) {
      if (typeof value !== "number") {
        continue;
      }
      const next = (counts.get(value) ?? 0) + 1;
      counts.set(value, next);
      if (next > max) {
        majority = value;
        max = next;
      }
    }

    return majority;
  }

  function buildNode(vertices, depth) {
    const extruders = vertices.map((vertex) => {
      if (typeof vertex.extruder === "number") {
        return vertex.extruder;
      }
      const resolved = closestExtruder(vertex.color);
      vertex.extruder = resolved;
      return resolved;
    });

    const isUniform = extruders.every((value) => value === extruders[0]);
    if (isUniform) {
      const extruder =
        extruders[0] ??
        (typeof fallbackExtruder === "number" ? fallbackExtruder : 0);
      return { type: "leaf", extruder };
    }

    if (depth >= maxDepth) {
      return { type: "leaf", extruder: majorityExtruder(extruders) };
    }

    const mids = [
      { color: averageColor(vertices[0].color, vertices[1].color) },
      { color: averageColor(vertices[1].color, vertices[2].color) },
      { color: averageColor(vertices[2].color, vertices[0].color) },
    ];

    mids.forEach((mid, index) => {
      const hintPairs = [
        [vertices[0], vertices[1]],
        [vertices[1], vertices[2]],
        [vertices[2], vertices[0]],
      ];
      const hints = hintPairs[index]
        .map((vert) => vert.extruder)
        .filter((value) => typeof value === "number");
      mid.extruder = closestExtruder(mid.color, hints);
    });

    const childrenVertices = [
      [vertices[0], mids[0], mids[2]],
      [mids[0], vertices[1], mids[1]],
      [mids[2], mids[1], vertices[2]],
      [mids[0], mids[1], mids[2]],
    ];

    const children = childrenVertices.map((childVerts) =>
      buildNode(childVerts, depth + 1),
    );

    const firstChild = children[0];
    const canCollapse =
      firstChild.type === "leaf" &&
      children.every(
        (child) =>
          child.type === "leaf" && child.extruder === firstChild.extruder,
      );

    if (canCollapse) {
      return { type: "leaf", extruder: firstChild.extruder };
    }

    return {
      type: "split",
      splitSides: 3,
      specialSide: 0,
      children,
    };
  }

  function serializeNode(node, bits) {
    const splitSides = node.type === "split" ? node.splitSides : 0;
    bits.push(Boolean(splitSides & 0b01));
    bits.push(Boolean(splitSides & 0b10));

    if (splitSides > 0) {
      const specialSide = node.specialSide ?? 0;
      bits.push(Boolean(specialSide & 0b01));
      bits.push(Boolean(specialSide & 0b10));

      for (let idx = node.children.length - 1; idx >= 0; idx -= 1) {
        serializeNode(node.children[idx], bits);
      }
      return;
    }

    let extruder = typeof node.extruder === "number" ? node.extruder : 0;
    if (extruder < 0) {
      extruder = 0;
    }

    if (extruder >= 3) {
      bits.push(true);
      bits.push(true);
      let value = extruder - 3;
      while (value >= 15) {
        bits.push(true, true, true, true);
        value -= 15;
      }
      bits.push(Boolean(value & 0b0001));
      bits.push(Boolean(value & 0b0010));
      bits.push(Boolean(value & 0b0100));
      bits.push(Boolean(value & 0b1000));
    } else {
      bits.push(Boolean(extruder & 0b01));
      bits.push(Boolean(extruder & 0b10));
    }
  }

  function bitsToHex(bits) {
    if (!Array.isArray(bits) || bits.length === 0) {
      return null;
    }

    const digits = [];
    for (let offset = 0; offset < bits.length; offset += 4) {
      let nibble = 0;
      for (let i = 3; i >= 0; i -= 1) {
        const bit = bits[offset + i] ? 1 : 0;
        nibble = (nibble << 1) | bit;
      }
      digits.unshift(nibble.toString(16).toUpperCase());
    }

    return digits.join("");
  }

  const root = buildNode(seedVertices, 0);
  if (!root) {
    return null;
  }

  const bits = [];
  serializeNode(root, bits);
  return bitsToHex(bits);
}
