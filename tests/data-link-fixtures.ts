export const DATA_LINK_KEY = 'ugyfel-kulcs-0001-KASSZ'

export const PDF_BASE64: string = btoa('%PDF-1.4\n%kassza teszt\n%%EOF')

export function outgoingInvoiceXml(
  options: { readonly id?: number; readonly registrationNumber?: string } = {},
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<szamla xmlns="http://www.szamlazz.hu/szamla">
  <szallito>
    <id>501</id>
    <nev>Kassza Teszt Kft.</nev>
    <cim><orszag>Magyarország</orszag><irsz>1111</irsz><telepules>Budapest</telepules><cim>Teszt utca 1.</cim></cim>
    <adoszam>12345676-2-42</adoszam>
    <bank><nev>Teszt Bank</nev><bankszamla>11773016-11111018</bankszamla></bank>
  </szallito>
  <alap>
    <id>${options.id ?? 2001}</id>
    <szamlaszam>E-KASSZA-2026-12</szamlaszam>
    <gazdEsemAzon>77</gazdEsemAzon>
    ${options.registrationNumber ? `<iktatoszam>${options.registrationNumber}</iktatoszam>` : ''}
    <tipus>SZ</tipus>
    <eszamla>0</eszamla>
    <kelt>2026-10-01</kelt>
    <telj>2026-10-01</telj>
    <fizh>2026-10-01</fizh>
    <fizmod>Stripe bankkártya</fizmod>
    <fizmodunified>bankkártya</fizmodunified>
    <keszpenz>false</keszpenz>
    <rendelesszam>STRIPE-pi_1</rendelesszam>
    <nyelv>hu</nyelv>
    <devizanem>HUF</devizanem>
    <penzforg>false</penzforg>
    <kata>false</kata>
    <katafokonyv>false</katafokonyv>
    <email>vevo@pelda.hu</email>
    <teszt>true</teszt>
    <sztornozott>false</sztornozott>
  </alap>
  <vevo>
    <nev>Vevő Kft.</nev>
    <cim><orszag>Magyarország</orszag><irsz>1117</irsz><telepules>Budapest</telepules><cim>Fő utca 2.</cim></cim>
    <email>vevo@pelda.hu</email>
    <adoszam>11111111-2-42</adoszam>
    <lokacio>1</lokacio>
    <privatePersonIndicator>false</privatePersonIndicator>
  </vevo>
  <tetelek>
    <tetel>
      <nev>Tanácsadás</nev>
      <mennyiseg>2</mennyiseg>
      <mennyisegiegyseg>óra</mennyisegiegyseg>
      <nettoegysegar>10000</nettoegysegar>
      <afakulcs>27</afakulcs>
      <netto>20000</netto>
      <afa>5400</afa>
      <brutto>25400</brutto>
      <sztetordering>1</sztetordering>
    </tetel>
  </tetelek>
  <osszegek>
    <afakulcsossz><afakulcs>27</afakulcs><netto>20000</netto><afa>5400</afa><brutto>25400</brutto></afakulcsossz>
    <totalossz><netto>20000</netto><afa>5400</afa><brutto>25400</brutto></totalossz>
  </osszegek>
  <kifizetesek>
    <kifizetes><datum>2026-10-01</datum><jogcim>bankkártya</jogcim><osszeg>25400</osszeg></kifizetes>
  </kifizetesek>
  <pdf>${PDF_BASE64}</pdf>
</szamla>`
}

export function incomingInvoiceXml(options: { readonly deleted?: boolean } = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<szamlabe xmlns="http://www.szamlazz.hu/szamlabe">
  <szallito>
    <id>9001</id>
    <nev>Beszállító Bt.</nev>
    <cim><irsz>6720</irsz><telepules>Szeged</telepules><cim>Kossuth tér 1.</cim></cim>
    <adoszam>22222222-2-06</adoszam>
  </szallito>
  <alap>
    <id>3001</id>
    <szamlaszam>BESZ-2026-5</szamlaszam>
    <gazdEsemAzon>88</gazdEsemAzon>
    <tipus>SZ</tipus>
    <eszamla>1</eszamla>
    <kelt>2026-09-30</kelt>
    <telj>2026-09-30</telj>
    <fizh>2026-10-08</fizh>
    <fizmod>átutalás</fizmod>
    <fizmodunified>átutalás</fizmodunified>
    <keszpenz>false</keszpenz>
    <nyelv>hu</nyelv>
    <devizanem>EUR</devizanem>
    <devizabank>MNB</devizabank>
    <devizaarf>395.5</devizaarf>
    <penzforg>false</penzforg>
    <kata>false</kata>
    <katafokonyv>false</katafokonyv>
    <teszt>false</teszt>
    ${options.deleted ? '<dobdel>true</dobdel>' : ''}
  </alap>
  <vevo>
    <nev>Kassza Teszt Kft.</nev>
    <cim><irsz>1111</irsz><telepules>Budapest</telepules><cim>Teszt utca 1.</cim></cim>
    <adoszam>12345676-2-42</adoszam>
    <lokacio>1</lokacio>
  </vevo>
  <tetelek>
    <tetel>
      <nev>Alkatrész</nev>
      <mennyiseg>1</mennyiseg>
      <mennyisegiegyseg>db</mennyisegiegyseg>
      <nettoegysegar>100</nettoegysegar>
      <afakulcs>27</afakulcs>
      <netto>100</netto>
      <afa>27</afa>
      <brutto>127</brutto>
      <sztetordering>1</sztetordering>
    </tetel>
  </tetelek>
  <osszegek>
    <afakulcsossz><afakulcs>27</afakulcs><netto>100</netto><afa>27</afa><brutto>127</brutto></afakulcsossz>
    <totalossz><netto>100</netto><afa>27</afa><brutto>127</brutto></totalossz>
  </osszegek>
</szamlabe>`
}

export function bankTransactionXml(direction: 'BE' | 'KI' = 'BE'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<banktranz xmlns="http://www.szamlazz.hu/banktranz">
  <id>4001</id>
  <bankszamla>11773016-11111018</bankszamla>
  <erteknap>2026-10-01</erteknap>
  <irany>${direction}</irany>
  <tipus>átutalás</tipus>
  <technikai>false</technikai>
  <osszeg>25400</osszeg>
  <devizanem>HUF</devizanem>
  <partner><nev>Vevő Kft.</nev><bankszamla>10918001-00000000-00000000</bankszamla></partner>
  <kozlemeny>E-KASSZA-2026-12</kozlemeny>
</banktranz>`
}

function archivedReceipt(options: {
  readonly id: number
  readonly number: string
  readonly type: 'NY' | 'SN'
  readonly gross: number
  readonly reversed?: string
  readonly isReversed?: boolean
}): string {
  const sign = options.type === 'SN' ? -1 : 1
  const net = (sign * options.gross) / 1.27
  const netRounded = Math.round(net * 100) / 100
  const vat = Math.round((sign * options.gross - netRounded) * 100) / 100
  return `<nyugta>
    <alap>
      <id>${options.id}</id>
      <hivasAzonosito>CALL-${options.id}</hivasAzonosito>
      <nyugtaszam>${options.number}</nyugtaszam>
      <tipus>${options.type}</tipus>
      <stornozott>${options.isReversed === true ? 'true' : 'false'}</stornozott>
      ${options.reversed ? `<stornozottNyugtaszam>${options.reversed}</stornozottNyugtaszam>` : ''}
      <kelt>2026-10-01</kelt>
      <fizmod>készpénz</fizmod>
      <penznem>HUF</penznem>
      <teszt>false</teszt>
      <adoszam>12345676-2-42</adoszam>
      <rendelesSzam>WEB-${options.id}</rendelesSzam>
    </alap>
    <tetelek>
      <tetel>
        <megnevezes>Kávé</megnevezes>
        <nettoEgysegar>${netRounded}</nettoEgysegar>
        <mennyiseg>1</mennyiseg>
        <mennyisegiEgyseg>db</mennyisegiEgyseg>
        <netto>${netRounded}</netto>
        <afakulcs>27</afakulcs>
        <afa>${vat}</afa>
        <brutto>${sign * options.gross}</brutto>
      </tetel>
    </tetelek>
    <kifizetesek>
      <kifizetes><fizetoeszkoz>készpénz</fizetoeszkoz><osszeg>${sign * options.gross}</osszeg></kifizetes>
    </kifizetesek>
    <osszegek>
      <afakulcsossz><afakulcs>27</afakulcs><netto>${netRounded}</netto><afa>${vat}</afa><brutto>${sign * options.gross}</brutto></afakulcsossz>
      <totalossz><netto>${netRounded}</netto><afa>${vat}</afa><brutto>${sign * options.gross}</brutto></totalossz>
    </osszegek>
  </nyugta>`
}

export function receiptArchiveXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xmlnyugtaarchiv xmlns="http://www.szamlazz.hu/xmlnyugtaarchiv">
  ${archivedReceipt({ id: 1, number: 'NYGT-2026-41', type: 'NY', gross: 890, isReversed: true })}
  ${archivedReceipt({ id: 2, number: 'NYGT-2026-42', type: 'SN', gross: 890, reversed: 'NYGT-2026-41' })}
</xmlnyugtaarchiv>`
}
