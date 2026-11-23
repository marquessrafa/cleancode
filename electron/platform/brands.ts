// Fabricante a partir do modelo/fornecedor do disco (comum a todas as plataformas).
const BRANDS: [RegExp, string][] = [
  [/^apple\b/i, 'Apple'],
  [/samsung|^mz-/i, 'Samsung'], [/^wdc|western digital|^wd[ \w]|wd_black|wd blue|wd green|wd red/i, 'Western Digital'],
  [/^st\d|seagate|barracuda|firecuda|ironwolf/i, 'Seagate'], [/kingston|^sa400|^skc|^sv300|^snv/i, 'Kingston'],
  [/crucial|^ct\d|micron|^mtfd/i, 'Crucial / Micron'], [/sandisk/i, 'SanDisk'], [/toshiba|^dt01|^mq0/i, 'Toshiba'],
  [/kioxia|^exceria/i, 'Kioxia'], [/intel|^ssdpe|^ssdsc/i, 'Intel'], [/hynix|^hfs|^hfm/i, 'SK hynix'], [/adata|xpg|^sx\d/i, 'ADATA / XPG'],
  [/lexar/i, 'Lexar'], [/corsair|^force mp/i, 'Corsair'], [/sabrent|rocket/i, 'Sabrent'], [/hgst|hitachi|^hds|^hts/i, 'HGST / Hitachi'],
  [/transcend/i, 'Transcend'], [/pny/i, 'PNY'], [/verbatim/i, 'Verbatim'], [/netac/i, 'Netac'], [/patriot/i, 'Patriot'],
  [/team|t-force/i, 'TeamGroup'], [/gigabyte|aorus/i, 'Gigabyte'], [/msi spatium|spatium/i, 'MSI'], [/apacer/i, 'Apacer'],
  [/silicon power|^sp\d/i, 'Silicon Power'], [/phison/i, 'Phison'], [/lenovo/i, 'Lenovo'], [/asus|rog strix/i, 'ASUS'],
  [/lacie/i, 'LaCie'], [/maxtor/i, 'Maxtor'], [/hp |^hp$|hewlett/i, 'HP'], [/dell/i, 'Dell'], [/teclast/i, 'Teclast'],
  [/realtek/i, 'Realtek'], [/jmicron|jms5/i, 'JMicron'], [/asmedia|asm\d/i, 'ASMedia'], [/msft|microsoft virtual/i, 'Microsoft'],
];
export function brandOf(...texts: string[]): string | undefined {
  for (const t of texts) { if (!t) continue; for (const [re, b] of BRANDS) if (re.test(t)) return b; }
  return undefined;
}
