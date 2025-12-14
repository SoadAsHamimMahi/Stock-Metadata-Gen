// src/lib/csv.ts
export type Row = {
  filename: string;
  platform: 'General'|'Adobe Stock'|'Shutterstock';
  title: string;
  description: string;
  keywords: string[];
  assetType: 'photo'|'illustration'|'vector'|'3d'|'icon'|'video';
  extension: string;
  error?: string; // Optional error message for failed generations
};

type GenerationPlatform = 'general' | 'adobe' | 'shutterstock';

export function toCSV(
  rows: Row[],
  titleLen: number,
  descLen: number,
  kwCount: number,
  platform?: GenerationPlatform
) {
  const esc = (s: string) => `"${(s || '').replaceAll('"','""')}"`;

  // Shutterstock-specific upload CSV format
  if (platform === 'shutterstock') {
    const header = [
      'Filename',
      'Description',
      'Keywords',
      'Categories',
      'Editorial',
      'Mature content',
      'illustration'
    ].join(',');

    const lines = rows.map(r => {
      const illustrationFlag =
        r.assetType === 'illustration' || r.assetType === 'vector' ? 'yes' : 'no';

      return [
        esc(r.filename),
        esc(r.description),
        esc(r.keywords.join(',')), // Shutterstock expects comma-separated keywords
        '',                        // Categories (left empty for manual fill)
        'no',                      // Editorial default
        'no',                      // Mature content default
        illustrationFlag
      ].join(',');
    });

    return [header, ...lines].join('\n');
  }

  // General / Adobe-style CSV (standard format used by app)
  const header = [
    'filename','platform','title','description','keywords',
    'asset_type','extension','title_length','description_length','keywords_count'
  ].join(',');

  const lines = rows.map(r =>
    [
      esc(r.filename),
      r.platform,
      esc(r.title),
      esc(r.description),
      esc(r.keywords.join(', ')),
      r.assetType,
      r.extension,
      titleLen,
      descLen,
      // Use actual row keyword count (supports Auto keyword mode)
      r.keywords?.length ?? kwCount
    ].join(',')
  );

  return [header, ...lines].join('\n');
}

/**
 * Group rows by file extension, normalizing extensions and grouping video formats
 * @param rows - Array of Row objects to group
 * @returns Record mapping normalized extension to array of rows
 */
export function groupRowsByExtension(rows: Row[]): Record<string, Row[]> {
  const groups: Record<string, Row[]> = {};

  for (const row of rows) {
    if (row.error) continue; // Skip rows with errors

    let ext = row.extension.toLowerCase();

    // Normalize extensions
    if (ext === 'jpeg') ext = 'jpg';

    // Group video formats together
    if (['mp4', 'mov', 'm4v', 'webm'].includes(ext)) {
      ext = 'video';
    }

    if (!groups[ext]) {
      groups[ext] = [];
    }
    groups[ext].push(row);
  }

  return groups;
}