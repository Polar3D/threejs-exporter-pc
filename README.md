# Three.js Exporter PC

Enhanced Three.js 3MF exporter with **multi-color support** specifically optimized for Bambu Slicer and other modern 3D printing slicers.

## Features

- ✅ **Multi-color 3MF export** with proper paint data
- ✅ **Bambu Slicer compatible** with material definitions
- ✅ **Material namespace support** (xmlns:m)
- ✅ **Paint IDs on triangles** for accurate color mapping
- ✅ **Base materials and color groups**
- ✅ **Automatic printer bed centering**
- ✅ **TypeScript support** with full type definitions

## Installation

```bash
npm install threejs-exporter-pc
```

## Usage

### Basic Export

```javascript
import { exportTo3MF } from "threejs-exporter-pc";
import * as THREE from "three";

// Create your Three.js scene with meshes
const scene = new THREE.Scene();
const geometry = new THREE.BoxGeometry(1, 1, 1);

// Create materials with different colors
const redMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const blueMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });

const redMesh = new THREE.Mesh(geometry, redMaterial);
const blueMesh = new THREE.Mesh(geometry, blueMaterial);
blueMesh.position.x = 2;

scene.add(redMesh);
scene.add(blueMesh);

// Export to 3MF
const blob = await exportTo3MF(scene);

// Download or process the blob
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "multi-color-model.3mf";
a.click();
```

### With Printer Configuration

```javascript
import { exportTo3MF } from "threejs-exporter-pc";

const printerConfig = {
  printer_name: "Bambu Lab X1C",
  filament: "Bambu PLA Basic @BBL X1C",
  printableWidth: 256,
  printableDepth: 256,
  printableHeight: 256,
  printableArea: ["0x0", "256x0", "256x256", "0x256"],
  printerSettingsId: "Bambu Lab X1C 0.4 nozzle",
  printSettingsId: "0.20mm Standard @BBL X1C",
};

const blob = await exportTo3MF(scene, printerConfig);
```

## Multi-Color Support

This exporter properly handles multi-color objects by:

1. **Analyzing mesh materials** and extracting unique colors
2. **Creating base materials** with proper display colors
3. **Generating color groups** for each unique material
4. **Assigning paint IDs** to triangles based on their material
5. **Including proper XML namespaces** for materials extension

### Material Requirements

For proper multi-color export, ensure your Three.js meshes have:

```javascript
// Each mesh should have a material with a color property
const material = new THREE.MeshBasicMaterial({
  color: 0xff0000, // Required for color detection
  name: "Red PLA", // Optional, used for material naming
});

const mesh = new THREE.Mesh(geometry, material);
mesh.name = "RedPart"; // Optional, used for component naming
```

## Supported Slicers

- ✅ **Bambu Studio** - Full multi-color support
- ✅ **Bambu Slicer** - Full multi-color support
- ✅ **PrusaSlicer** - Basic support
- ✅ **Other 3MF-compatible slicers** - Varies by implementation

## CLI Usage with Bambu Slicer

Perfect for server-side 3D printing workflows:

```bash
# Export 3MF from your application
node export-script.js > model.3mf

# Slice with Bambu Slicer CLI
/BambuStudio --load-settings printer.json \
  --load-settings process.json \
  --load-filaments filament.json \
  --outputdir ./output \
  --export-3mf model.3mf \
  --allow-multicolor-oneplate \
  --slice 0 \
  --debug 2 \
  input.3mf
```

## API Reference

### `exportTo3MF(object, printJobConfig?)`

Exports a Three.js Object3D to 3MF format.

**Parameters:**

- `object: Object3D` - Three.js object to export (Scene, Group, Mesh, etc.)
- `printJobConfig?: PrintJobConfig` - Optional printer configuration

**Returns:** `Promise<Blob>` - 3MF file as a Blob

### `PrintJobConfig`

```typescript
interface PrintJobConfig {
  printer_name?: string; // e.g., "Bambu Lab A1"
  filament?: string; // e.g., "Bambu PLA Basic @BBL A1"
  printableWidth?: number; // Build plate width in mm
  printableDepth?: number; // Build plate depth in mm
  printableHeight?: number; // Max print height in mm
  printableArea?: string[]; // Build plate area coordinates
  printerSettingsId?: string; // Printer profile identifier
  printSettingsId?: string; // Print settings identifier
  placement?: { x: number; y: number }; // Bed position (mm) for the model's center; default is the bed center
}
```

## Differences from `three-3mf-exporter`

This package extends the original `three-3mf-exporter` with:

- 🔥 **Multi-color support** - Proper paint data for each triangle
- 🔥 **Material resources** - Base materials and color groups
- 🔥 **XML namespaces** - Full materials extension support
- 🔥 **Bambu Slicer optimization** - Tested with Bambu Studio/Slicer
- 🔥 **Better TypeScript** - Complete type definitions

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Credits

Based on the original [`three-3mf-exporter`](https://www.npmjs.com/package/three-3mf-exporter) with significant enhancements for multi-color 3D printing workflows.

Built with ❤️ by [Polar3D](https://polar3d.com) for the 3D printing community.
