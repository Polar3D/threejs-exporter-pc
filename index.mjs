import { XMLBuilder } from "fast-xml-parser";
import JSZip from "jszip";
import { Color, Vector3 } from "three";

import { encodePaintColor } from "./mmu-segmentation.mjs";

const CACHE_BUST = 1760120000 + Math.floor(Math.random() * 1000000);

console.log(
  `🔥 EXPORTER VERSION: ${CACHE_BUST} - WITH PID ATTRIBUTES (SINGLE OBJECT)`,
);

const defaultPrintConfig = {
  printer_name: "Bambu Lab A1",
  filament: "Bambu PLA Basic @BBL A1",
  printableWidth: 256,
  printableDepth: 256,
  printableHeight: 256,
  printableArea: ["0x0", "256x0", "256x256", "0x256"],
  printerSettingsId: "Bambu Lab A1 0.4 nozzle",
  printSettingsId: "0.20mm Standard @BBL A1",
};
async function exportTo3MF(object, printJobConfig = {}) {
  console.log("🚀 Starting 3MF export...");

  const objectId = 1;
  const objectFileName = `object-${objectId}.model`;
  const zip = new JSZip();
  const printConfig = { ...defaultPrintConfig, ...printJobConfig };
  const components = [];
  const materials = [];

  collectComponents(object, components, materials);

  console.log("📊 Export Summary:", {
    components: components.length,
    materials: materials.length,
    uniqueColors: [
      ...new Set(materials.map((mat) => `#${mat.color.getHexString()}`)),
    ],
    printerName: printConfig.printer_name,
  });

  materials.forEach((mat, index) => {
    console.log(`  Material ${index}:`, {
      id: mat.id,
      color: `#${mat.color.getHexString()}`,
      extruder: mat.extruder,
      name: mat.name,
    });
  });

  const boundingBox = calculateBoundingBox(components);
  const modelCenter = calculateModelCenter(boundingBox);
  const transform = calculateCenteringTransform(
    modelCenter,
    boundingBox,
    printConfig,
  );
  const mainModelXml = createMainModelXML(
    objectId,
    components,
    transform,
    materials,
    objectFileName,
  );
  const objectModelXml = createObjectModelXML(components);
  const modelSettingsXml = createModelSettingsXML(objectId, components);
  const projectSettingsConfig = createProjectSettingsConfig(
    materials,
    printConfig,
  );

  zip.file(
    "_rels/.rels",
    relationshipsXML({ id: "rel-1", target: "/3D/3dmodel.model" }),
  );
  zip.file("3D/3dmodel.model", mainModelXml);
  zip.file(
    "3D/_rels/3dmodel.model.rels",
    relationshipsXML({
      id: `rel-${objectId}`,
      target: `/3D/Objects/${objectFileName}`,
    }),
  );
  zip.file(`3D/Objects/${objectFileName}`, objectModelXml);
  zip.file("Metadata/model_settings.config", modelSettingsXml);
  zip.file("Metadata/project_settings.config", projectSettingsConfig);
  zip.file("[Content_Types].xml", contentTypesXML());

  console.log("✅ 3MF export complete!");
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
  });
}
function collectComponents(object, components, materials) {
  object.updateMatrixWorld(true);

  if (object.type === "Mesh") {
    const mesh = object;
    const geometry = mesh.geometry;
    const positionAttr = geometry?.attributes?.position;

    if (!geometry || !positionAttr) {
      console.log("⚠️  Mesh missing position attribute, skipping");
      return;
    }

    const colorAttr = geometry.attributes.color ?? null;
    const indexAttr = geometry.index ?? null;

    const materialList = Array.isArray(mesh.material)
      ? mesh.material.filter(Boolean)
      : mesh.material
        ? [mesh.material]
        : [];

    const meshName = typeof mesh.name === "string" ? mesh.name : "";
    const meshNameLower = meshName.toLowerCase();

    const overlayByName = meshNameLower.includes("paint_layer");
    const overlayByMaterial = materialList.some((mat) =>
      typeof mat?.name === "string"
        ? mat.name.toLowerCase().includes("paint_layer")
        : false,
    );

    if (overlayByName || overlayByMaterial) {
      console.log(`🧹 Skipping paint overlay mesh: ${meshName || "<unnamed>"}`);
      return;
    }

    console.log("🔍 Processing mesh:", {
      name: meshName,
      hasColorAttribute: !!colorAttr,
      vertexCount: positionAttr.count,
      triangleCount: indexAttr ? indexAttr.count / 3 : positionAttr.count / 3,
    });

    let materialInfo = null;

    if (materialList.length > 0) {
      const baseMaterial = materialList[0];
      const baseColor = new Color();

      if ("color" in baseMaterial && baseMaterial.color) {
        baseColor.copy(baseMaterial.color);
      } else {
        baseColor.set(0x808080);
      }

      const existingMaterial = materials.find(
        (mat) =>
          mat.color.r === baseColor.r &&
          mat.color.g === baseColor.g &&
          mat.color.b === baseColor.b,
      );

      if (existingMaterial) {
        console.log("  ♻️  Reusing existing material ID:", existingMaterial.id);
        materialInfo = existingMaterial;
      } else {
        // ✅ EXTRUDER NUMBERING: 1-indexed to match BambuStudio's expectations
        // BambuStudio uses 1-based extruder IDs (1, 2, 3, ...) not 0-based
        // Material ID is 0-based for array indexing, but extruder is 1-based
        const extruder = materials.length + 1;
        materialInfo = {
          id: materials.length,
          color: baseColor.clone(),
          name:
            typeof baseMaterial.name === "string" && baseMaterial.name.length
              ? baseMaterial.name
              : meshName
                ? `${meshName}_material`
                : `material_${materials.length}`,
          extruder, // 1-indexed: first material gets extruder=1
        };
        materials.push(materialInfo);
        console.log("  ✨ Created new material:", {
          id: materialInfo.id,
          color: `#${materialInfo.color.getHexString()}`,
          extruder: materialInfo.extruder,
          name: materialInfo.name,
        });
      }
    }

    if (!materialInfo) {
      const fallbackColor = new Color(0x808080);
      const extruder = materials.length + 1;
      materialInfo = {
        id: materials.length,
        color: fallbackColor,
        name: meshName
          ? `${meshName}_material`
          : `material_${materials.length}`,
        extruder,
      };
      materials.push(materialInfo);
      console.log("  ℹ️ Assigned fallback material", {
        id: materialInfo.id,
        color: `#${fallbackColor.getHexString()}`,
        extruder: materialInfo.extruder,
        name: materialInfo.name,
      });
    }

    const component = {
      id: components.length + 1,
      vertices: [],
      triangles: [],
      material: materialInfo,
      name: meshName || `Default-${components.length + 1}`,
      hasPaintData: !!colorAttr,
      transform: mesh.matrixWorld.clone(), // Store transformation matrix
    };

    const vertexMap = new Map();
    const worldMatrix = mesh.matrixWorld;
    const vertexColorToMaterial = new Map();

    // ✅ COORDINATE SPACE: Export vertices in LOCAL space (BambuStudio format)
    // BambuStudio exports vertices in object local space and applies transformation
    // matrix separately in the component transform. This matches their format exactly.
    // Painting works in world space, but export preserves local coordinates.
    const processVertex = (vertexIndex) => {
      const vertex = new Vector3();
      vertex.fromBufferAttribute(positionAttr, vertexIndex);
      // DO NOT transform to world space - BambuStudio expects local coordinates
      const vertexKey = `${vertex.x},${vertex.y},${vertex.z}`;
      if (!vertexMap.has(vertexKey)) {
        vertexMap.set(vertexKey, component.vertices.length);
        component.vertices.push({ x: vertex.x, y: vertex.y, z: vertex.z });
      }
      return vertexMap.get(vertexKey);
    };

    const getMaterialFromColor = (vertexIndex) => {
      if (!colorAttr) return null;

      const r = Math.round(colorAttr.getX(vertexIndex) * 255);
      const g = Math.round(colorAttr.getY(vertexIndex) * 255);
      const b = Math.round(colorAttr.getZ(vertexIndex) * 255);
      const colorKey = `${r},${g},${b}`;

      if (!vertexColorToMaterial.has(colorKey)) {
        const color = new Color(r / 255, g / 255, b / 255);
        const baseR = Math.round(materialInfo.color.r * 255);
        const baseG = Math.round(materialInfo.color.g * 255);
        const baseB = Math.round(materialInfo.color.b * 255);

        // Color matching tolerance: ±2 RGB units (configurable for accuracy)
        // This balances between precision and material consolidation
        const COLOR_TOLERANCE = 2;
        const matchesBaseMaterial =
          Math.abs(r - baseR) <= COLOR_TOLERANCE &&
          Math.abs(g - baseG) <= COLOR_TOLERANCE &&
          Math.abs(b - baseB) <= COLOR_TOLERANCE;

        if (matchesBaseMaterial) {
          vertexColorToMaterial.set(colorKey, materialInfo);
          if (vertexColorToMaterial.size === 1) {
            console.log(
              "  ✅ Base color vertex detected - using base material:",
              {
                id: materialInfo.id,
                vertexRGB: `rgb(${r}, ${g}, ${b})`,
                baseRGB: `rgb(${baseR}, ${baseG}, ${baseB})`,
                color: `#${materialInfo.color.getHexString()}`,
                extruder: materialInfo.extruder,
              },
            );
          }
        } else {
          const existingMaterial = materials.find(
            (mat) =>
              Math.abs(mat.color.r - color.r) < 0.01 &&
              Math.abs(mat.color.g - color.g) < 0.01 &&
              Math.abs(mat.color.b - color.b) < 0.01,
          );

          if (existingMaterial) {
            vertexColorToMaterial.set(colorKey, existingMaterial);
          } else {
            // ✅ PAINT MATERIAL EXTRUDER: Sequential 1-based numbering
            // Each new paint color gets the next available extruder ID
            const extruder = materials.length + 1;
            const newMaterial = {
              id: materials.length,
              color,
              name: `Paint_${materials.length}`,
              extruder, // 1-indexed
            };
            materials.push(newMaterial);
            vertexColorToMaterial.set(colorKey, newMaterial);
            console.log("  🎨 Created paint material:", {
              id: newMaterial.id,
              color: `#${color.getHexString()}`,
              extruder: newMaterial.extruder,
              name: newMaterial.name,
            });
          }
        }
      }

      return vertexColorToMaterial.get(colorKey);
    };

    const getVertexColor = (vertexIndex) => {
      if (!colorAttr) return null;
      const color = new Color();
      color.setRGB(
        colorAttr.getX(vertexIndex),
        colorAttr.getY(vertexIndex),
        colorAttr.getZ(vertexIndex),
      );
      return { r: color.r, g: color.g, b: color.b };
    };

    const applyPaintColor = (triangle) => {
      const baseExtruder = component.material?.extruder ?? null;
      const paintColor = encodePaintColor(triangle, baseExtruder, materials);
      if (paintColor) {
        triangle.paintColor = paintColor;
      }
    };

    const edgeTmpA = new Vector3();
    const edgeTmpB = new Vector3();

    const pushTriangle = (triangle) => {
      const { v1, v2, v3 } = triangle;
      if (v1 === v2 || v2 === v3 || v1 === v3) {
        return;
      }

      const pa = component.vertices[v1];
      const pb = component.vertices[v2];
      const pc = component.vertices[v3];

      edgeTmpA.set(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
      edgeTmpB.set(pc.x - pa.x, pc.y - pa.y, pc.z - pa.z);
      const areaSquared = edgeTmpA.cross(edgeTmpB).lengthSq();
      if (areaSquared < 1e-12) {
        return;
      }

      component.triangles.push(triangle);
    };

    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 3) {
        const idx0 = indexAttr.getX(i);
        const idx1 = indexAttr.getX(i + 1);
        const idx2 = indexAttr.getX(i + 2);

        const v1 = processVertex(idx0);
        const v2 = processVertex(idx1);
        const v3 = processVertex(idx2);

        const triangle = { v1, v2, v3 };

        if (colorAttr) {
          triangle.vertexMaterials = [
            getMaterialFromColor(idx0),
            getMaterialFromColor(idx1),
            getMaterialFromColor(idx2),
          ];
          triangle.vertexColors = [
            getVertexColor(idx0),
            getVertexColor(idx1),
            getVertexColor(idx2),
          ];
        }

        applyPaintColor(triangle);
        pushTriangle(triangle);
      }
    } else {
      for (let i = 0; i < positionAttr.count; i += 3) {
        const v1 = processVertex(i);
        const v2 = processVertex(i + 1);
        const v3 = processVertex(i + 2);

        const triangle = { v1, v2, v3 };

        if (colorAttr) {
          triangle.vertexMaterials = [
            getMaterialFromColor(i),
            getMaterialFromColor(i + 1),
            getMaterialFromColor(i + 2),
          ];
          triangle.vertexColors = [
            getVertexColor(i),
            getVertexColor(i + 1),
            getVertexColor(i + 2),
          ];
        }

        applyPaintColor(triangle);
        pushTriangle(triangle);
      }
    }

    if (component.triangles.length === 0) {
      console.log(
        `⚠️  Skipping mesh without valid triangles after filtering: ${component.name}`,
      );
    } else {
      component.id = components.length + 1;
      console.log(
        `🔍 Component: hasPaintData=${component.hasPaintData}, triangles=${component.triangles.length}, name=${component.name}`,
      );
      components.push(component);
    }
  }

  object.children.forEach((child) => {
    collectComponents(child, components, materials);
  });
}
function calculateBoundingBox(components) {
  if (components.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }
  const firstVertex = components[0].vertices[0] || { x: 0, y: 0, z: 0 };
  const min = { x: firstVertex.x, y: firstVertex.y, z: firstVertex.z };
  const max = { x: firstVertex.x, y: firstVertex.y, z: firstVertex.z };
  for (const component of components) {
    for (const vertex of component.vertices) {
      min.x = Math.min(min.x, vertex.x);
      min.y = Math.min(min.y, vertex.y);
      min.z = Math.min(min.z, vertex.z);
      max.x = Math.max(max.x, vertex.x);
      max.y = Math.max(max.y, vertex.y);
      max.z = Math.max(max.z, vertex.z);
    }
  }
  return { min, max };
}
function calculateModelCenter(boundingBox) {
  return {
    x: (boundingBox.min.x + boundingBox.max.x) / 2,
    y: (boundingBox.min.y + boundingBox.max.y) / 2,
    z: (boundingBox.min.z + boundingBox.max.z) / 2,
  };
}
function calculateCenteringTransform(modelCenter, boundingBox, printBed) {
  const bedCenter = {
    x: printBed.printableWidth / 2,
    y: printBed.printableDepth / 2,
    z: 0,
    // 通常Z坐标为0，模型放在打印床表面
  };
  const translation = {
    x: bedCenter.x - modelCenter.x,
    y: bedCenter.y - modelCenter.y,
    z: bedCenter.z - boundingBox.min.z,
    // 将模型的底部放在打印床上
  };
  return `1 0 0 0 1 0 0 0 1 ${translation.x.toFixed(4)} ${translation.y.toFixed(4)} ${translation.z.toFixed(4)}`;
}
function createMainModelXML(
  objectId,
  components,
  transform,
  materialsFromComponents,
  objectFileName,
) {
  const hasPaintData = components.some((component) => component.hasPaintData);

  // 🔧 Convert Three.js Matrix4 to 3MF transform format
  // 3MF format: "m11 m12 m13 m21 m22 m23 m31 m32 m33 tx ty tz"
  // Three.js matrix.elements is column-major, 3MF is row-major
  const componentTransforms = components.map((component) => {
    const m = component.transform.elements;
    // Three.js Matrix4 is column-major: [m11, m21, m31, m41, m12, ...]
    // 3MF needs row-major: m11 m21 m31 m12 m22 m32 m13 m23 m33 tx ty tz
    return `${m[0]} ${m[4]} ${m[8]} ${m[1]} ${m[5]} ${m[9]} ${m[2]} ${m[6]} ${m[10]} ${m[12]} ${m[13]} ${m[14]}`;
  });

  const now = new Date();
  const isoDate = now.toISOString().split("T")[0];
  const isoDateTime = now.toISOString();

  // 🎨 Enhanced metadata to match BambuStudio format
  const metadata = [
    { "@_name": "Application", "#text": "BambuStudio-02.01.01.52" },
    { "@_name": "BambuStudio:3mfVersion", "#text": "1" },
    { "@_name": "CreationDate", "#text": isoDate },
    { "@_name": "ModificationDate", "#text": isoDate },
    { "@_name": "Title", "#text": "Multi-Color 3D Model" },
    { "@_name": "Designer", "#text": "PolarCloud" },
    {
      "@_name": "Description",
      "#text":
        "Exported from PolarCloud Mbele Pro with multi-material paint support",
    },
    { "@_name": "Copyright", "#text": "[]" },
    { "@_name": "LicenseTerms", "#text": "" },
    { "@_name": "Rating", "#text": "" },
    { "@_name": "CreationDateTime", "#text": isoDateTime },
    { "@_name": "ModificationDateTime", "#text": isoDateTime },
    { "@_name": "kForeignVersion", "#text": "bambustudio_" },
    { "@_name": "kOrganization", "#text": "Bambu Lab" },
    { "@_name": "kSourceApplication", "#text": "BambuStudio" },
    { "@_name": "bambu:from_project_creation", "#text": "1" },
  ];

  if (hasPaintData) {
    metadata.push({ "@_name": "slic3rpe:MmPaintingVersion", "#text": "1" });
    metadata.push({ "@_name": "slic3rpe:ColorSpace", "#text": "RGB" });
  }

  const paletteEntries = [];
  const seenExtruders = new Set();

  materialsFromComponents.forEach((mat) => {
    if (!mat || typeof mat.extruder !== "number" || !mat.color) {
      return;
    }

    if (seenExtruders.has(mat.extruder)) {
      return;
    }

    seenExtruders.add(mat.extruder);
    paletteEntries.push({
      "@_extruder": mat.extruder.toString(),
      "@_color": `#${mat.color.getHexString().toUpperCase()}`,
    });
  });

  const model = {
    model: {
      "@_unit": "millimeter",
      "@_xml:lang": "en-US",
      "@_xmlns": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02",
      "@_xmlns:p":
        "http://schemas.microsoft.com/3dmanufacturing/production/2015/06",
      "@_xmlns:slic3rpe": "http://schemas.slic3r.org/3mf/2017/06",
      "@_xmlns:bambu": "http://schemas.bambulab.com/package/2021",
      "@_requiredextensions": "p",
      metadata,
      resources: {
        ...(paletteEntries.length
          ? {
              palette: {
                "@_name": "MulticolorPalette",
                "@_type": "multicolor",
                entry: paletteEntries,
              },
            }
          : {}),
        object: {
          "@_id": `${objectId}`,
          "@_p:uuid": generateUUID(),
          "@_type": "model",
          components: {
            component: components.map((component, index) => ({
              "@_p:path": `/3D/Objects/${objectFileName}`,
              "@_objectid": component.id.toString(),
              "@_p:uuid": generateUUID(),
              "@_transform": componentTransforms[index],
            })),
          },
        },
      },
      build: {
        "@_p:uuid": `${generateUUID()}1`,
        item: {
          "@_objectid": `${objectId}`,
          "@_p:uuid": `${generateUUID()}2`,
          "@_transform": transform,
          "@_printable": "1",
        },
      },
    },
  };

  const builder = new XMLBuilder({
    attributeNamePrefix: "@_",
    ignoreAttributes: false,
    format: true,
    indentBy: "  ",
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
${builder.build(model)}`;
}
function createObjectModelXML(components) {
  console.log(`📄 Creating object XML for ${components.length} components`);

  const objects = components.map((component) => {
    console.log(
      `  🔨 Building object ${component.id} with ${component.triangles.length} triangles`,
    );

    return {
      object: {
        "@_id": component.id.toString(),
        "@_p:uuid": generateUUID(),
        "@_type": "model",
        mesh: {
          vertices: {
            vertex: component.vertices.map((vertex) => ({
              "@_x": vertex.x.toFixed(7),
              "@_y": vertex.y.toFixed(7),
              "@_z": vertex.z.toFixed(7),
            })),
          },
          triangles: {
            triangle: component.triangles.map((triangle) => {
              const result = {
                "@_v1": triangle.v1,
                "@_v2": triangle.v2,
                "@_v3": triangle.v3,
              };

              if (triangle.paintColor) {
                result["@_paint_color"] = triangle.paintColor;
              }

              return result;
            }),
          },
        },
      },
    };
  });

  const model = {
    model: {
      "@_unit": "millimeter",
      "@_xml:lang": "en-US",
      "@_xmlns": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02",
      "@_xmlns:p":
        "http://schemas.microsoft.com/3dmanufacturing/production/2015/06",
      "@_xmlns:slic3rpe": "http://schemas.slic3r.org/3mf/2017/06",
      "@_xmlns:bambu": "http://schemas.bambulab.com/package/2021",
      resources: {
        object: objects.map((entry) => entry.object),
      },
      build: {},
    },
  };

  const builder = new XMLBuilder({
    attributeNamePrefix: "@_",
    ignoreAttributes: false,
    format: true,
    indentBy: "  ",
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
${builder.build(model)}`;
}
function createModelSettingsXML(objectId, components) {
  const partsXml = components
    .map((component) => {
      const extruder = component.material ? component.material.extruder : 1;
      const faceCount = component.triangles ? component.triangles.length : 0;

      return `    <part id="${component.id}" subtype="normal_part">
      <metadata key="name" value="${component.name}"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <metadata key="extruder" value="${extruder}"/>
      <mesh_stat face_count="${faceCount}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${objectId}">
    <metadata key="name" value="Exported3DModel.3mf"/>
    <metadata key="extruder" value="1"/>
    <metadata key="thumbnail_file" value=""/>
${partsXml}
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="plate-1"/>
    <model_instance>
      <metadata key="object_id" value="${objectId}"/>
      <metadata key="instance_id" value="0"/>
    </model_instance>
  </plate>
  <assemble>
    <assemble_item object_id="${objectId}" instance_id="0" offset="0 0 0"/>
  </assemble>
</config>`;
}
function createProjectSettingsConfig(materials, printConfig) {
  const colors = materials.map(
    (material) => `#${material.color.getHexString().toUpperCase()}`,
  );

  while (colors.length < 2) {
    colors.push("#FFFFFF");
  }

  const uniqueColors = [...new Set(colors)];

  const filamentIds = colors.map((color) => {
    const colorHex = color.replace("#", "").toLowerCase();
    return `GFL99_${colorHex}`;
  });

  const materialCount = colors.length;

  // 🎨 Enhanced project settings to match BambuStudio format more closely
  const projectSettings = {
    // Print bed configuration
    printable_area: printConfig.printableArea,
    printable_height: printConfig.printableHeight.toString(),
    bed_exclude_area: [],
    bed_temperature: Array.from({ length: materialCount }).fill("65"),

    // Filament configuration
    filament_type: Array.from({ length: materialCount }).fill("PLA"),
    filament_colour: colors,
    filament_ids: filamentIds,
    unique_filament: uniqueColors,
    filament_settings_id: Array.from({ length: materialCount }).fill(
      printConfig.filament || "Bambu PLA Basic @BBL A1",
    ),
    filament_diameter: Array.from({ length: materialCount }).fill("1.75"),
    filament_is_support: Array.from({ length: materialCount }).fill("0"),
    nozzle_temperature: Array.from({ length: materialCount }).fill("220"),
    nozzle_temperature_initial_layer: Array.from({
      length: materialCount,
    }).fill("220"),

    // Printer configuration
    printer_model: printConfig.printer_name,
    printer_settings_id:
      printConfig.printerSettingsId || "Bambu Lab A1 0.4 nozzle",
    printer_variant: "0.4",
    nozzle_diameter: ["0.4"],

    // Print quality settings
    layer_height: "0.2",
    initial_layer_print_height: "0.2",
    wall_loops: "2",
    top_shell_layers: "3",
    bottom_shell_layers: "3",
    sparse_infill_density: "15%",
    sparse_infill_pattern: "grid",

    // Support settings
    enable_support: "0",
    support_type: "normal(auto)",
    support_on_build_plate_only: "0",

    // Speed settings
    outer_wall_speed: "100",
    inner_wall_speed: "150",
    sparse_infill_speed: "150",
    initial_layer_speed: "50",
    travel_speed: "250",

    // Other settings
    print_settings_id: printConfig.printSettingsId || "0.20mm Standard @BBL A1",
    skirt_loops: "1",
    skirt_distance: "2",
    brim_width: "0",
    brim_type: "no_brim",

    // Filament usage (will be calculated during slicing)
    filament_used_g: Array.from({ length: materialCount }).fill("0"),
    filament_used_mm: Array.from({ length: materialCount }).fill("0"),
    total_filament_used_g: "0",

    // Multi-material settings
    flush_multiplier: Array.from({ length: materialCount }).fill("1.0"),
    enable_prime_tower: materialCount > 1 ? "1" : "0",
    prime_tower_width: materialCount > 1 ? "60" : "0",
    prime_volume: materialCount > 1 ? "45" : "0",
    wipe_tower_no_sparse_layers: "0",

    // Advanced settings
    adaptive_layer_height: "0",
    resolution: "0.012",
    xy_hole_compensation: "0",
    elefant_foot_compensation: "0",
  };

  return JSON.stringify(projectSettings);
}
function contentTypesXML() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>`;
}
function relationshipsXML(options) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rel-${options.id}" Target="${options.target}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
}
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 3) | 8;
    return v.toString(16);
  });
}

export { defaultPrintConfig, exportTo3MF };
