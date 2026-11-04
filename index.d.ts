import { Object3D } from 'three';

export interface PrintJobConfig {
    printer_name?: string;
    filament?: string;
    printableWidth?: number;
    printableDepth?: number;
    printableHeight?: number;
    printableArea?: string[];
    printerSettingsId?: string;
    printSettingsId?: string;
    /**
     * Bed position (mm, slicer coordinates) for the center of the model's
     * bounding box. Use it to keep objects where they were placed on the plate.
     * When left out, the model is centered on the bed.
     */
    placement?: { x: number; y: number };
}

export interface ExportResult {
    blob: Blob;
    mime: string;
    ext: '3mf';
}

export declare const defaultPrintConfig: PrintJobConfig;

/**
 * Export a Three.js object to 3MF format with multi-color support
 * @param object - Three.js Object3D to export
 * @param printJobConfig - Optional printer configuration
 * @returns Promise resolving to a Blob containing the 3MF file
 */
export declare function exportTo3MF(
    object: Object3D,
    printJobConfig?: PrintJobConfig
): Promise<Blob>;