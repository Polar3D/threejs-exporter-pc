# Publishing Instructions for threejs-exporter-pc

## Prerequisites

1. **Create npm account** at https://www.npmjs.com if you don't have one
2. **Login to npm** from command line:
   ```bash
   npm login
   ```

## Publishing Steps

### 1. Navigate to package directory

```bash
cd /Users/slimelephant/Documents/Work/PolarCloud/mbele-pro/threejs-exporter-pc
```

### 2. Test the package locally (optional but recommended)

```bash
# Install dependencies
npm install

# Test if the package loads correctly
node -e "import('./index.mjs').then(m => console.log('Package loaded:', Object.keys(m)))"
```

### 3. Check package contents

```bash
# See what files will be included in the npm package
npm pack --dry-run
```

### 4. Publish to npm

```bash
# For first publication
npm publish

# If the name is taken, you might need to use a scoped package:
# npm publish --access public
```

### 5. Alternative: Scoped Package (Recommended)

If "threejs-exporter-pc" is taken, use a scoped package:

```bash
# Update package.json name to:
"name": "@polar3d/threejs-exporter-pc"

# Then publish:
npm publish --access public
```

## After Publishing

### Install your package

```bash
npm install threejs-exporter-pc
# or
npm install @polar3d/threejs-exporter-pc
```

### Update your main project

In your main project, replace:

```javascript
// Old
import { exportTo3MF } from "three-3mf-exporter";

// New
import { exportTo3MF } from "threejs-exporter-pc";
// or
import { exportTo3MF } from "@polar3d/threejs-exporter-pc";
```

### Remove patch-package dependency

Once you're using your own package, you can:

1. Remove the patch file: `rm patches/three-3mf-exporter+0.0.4.patch`
2. Remove patch-package from devDependencies
3. Remove postinstall script from package.json
4. Uninstall original package: `npm uninstall three-3mf-exporter`

## Version Management

### For updates:

```bash
# Bump version
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0

# Publish new version
npm publish
```

## Troubleshooting

### Name already taken

- Try: `threejs-3mf-exporter-pc`
- Try: `three-3mf-multicolor`
- Use scoped: `@polar3d/threejs-exporter-pc`

### Authentication issues

```bash
npm whoami  # Check if logged in
npm login   # Login again
```

### Package validation

```bash
npm pack --dry-run  # Check what files are included
npm audit           # Check for vulnerabilities
```

## GitHub Repository (Optional but Recommended)

1. Create repo on GitHub: `Polar3D/threejs-exporter-pc`
2. Initialize git:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Multi-color 3MF exporter"
   git branch -M main
   git remote add origin https://github.com/Polar3D/threejs-exporter-pc.git
   git push -u origin main
   ```

This will make your package more discoverable and trustworthy.
