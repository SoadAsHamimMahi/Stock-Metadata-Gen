// src/lib/csv.ts
export type Row = {
  filename: string;
  platform: 'Adobe'|'Freepik'|'Shutterstock';
  title: string;
  description: string;
  keywords: string[];
  assetType: 'photo'|'illustration'|'vector'|'3d'|'icon'|'video';
  extension: string;
  error?: string; // Optional error message for failed generations
};

export function toCSV(rows: Row[], titleLen: number, descLen: number, kwCount: number) {
  const header = [
    'filename','platform','title','description','keywords',
    'asset_type','extension','title_length','description_length','keywords_count'
  ].join(',');
  const esc = (s: string) => `"${(s || '').replaceAll('"','""')}"`;
  const lines = rows.map(r => [
    esc(r.filename),
    r.platform,
    esc(r.title),
    esc(r.description),
    esc(r.keywords.join('; ')),
    r.assetType,
    r.extension,
    titleLen,
    descLen,
    kwCount
  ].join(','));
  return [header, ...lines].join('\n');
}
