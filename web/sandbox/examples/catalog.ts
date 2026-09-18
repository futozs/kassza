export type ExampleGroup = 'Számlák' | 'Nyugták' | 'NAV' | 'Hibakezelés' | 'Eszközök'

export interface ExampleMeta {
  readonly slug: string
  readonly title: string
  readonly group: ExampleGroup
  readonly description: string
  readonly docs?: string
}

export const EXAMPLE_GROUPS: readonly ExampleGroup[] = [
  'Számlák',
  'Nyugták',
  'NAV',
  'Hibakezelés',
  'Eszközök',
]

export const EXAMPLES: readonly ExampleMeta[] = [
  {
    slug: 'szamla',
    title: 'Számla kiállítása',
    group: 'Számlák',
    description: 'B2B számla nettó egységárakkal, fizetési határidővel és e-mail értesítővel.',
    docs: '/docs/szamla-letrehozas/minta',
  },
  {
    slug: 'szamla-brutto',
    title: 'Webshop számla bruttó árakkal',
    group: 'Számlák',
    description: 'Kártyával fizetett rendelés, bruttó egységárak, több áfakulcs, alapbeállítások.',
    docs: '/docs/szamla-letrehozas/beallitasok-es-szabalyok/kerekites',
  },
  {
    slug: 'dijbekero-szamla',
    title: 'Díjbekérő, majd számla',
    group: 'Számlák',
    description: 'Díjbekérő kiállítása, és a befizetés után a hozzá kapcsolt végleges számla.',
    docs: '/docs/szamla-letrehozas/beallitasok-es-szabalyok/bizonylattipusok',
  },
  {
    slug: 'eloleg-vegszamla',
    title: 'Előleg- és végszámla',
    group: 'Számlák',
    description: 'Projekt előleggel: előlegszámla, majd végszámla az előleg levonásával.',
    docs: '/docs/szamla-letrehozas/beallitasok-es-szabalyok/bizonylattipusok',
  },
  {
    slug: 'helyesbito-szamla',
    title: 'Helyesbítő számla',
    group: 'Számlák',
    description: 'Részleges visszáru helyesbítő számlával, negatív mennyiséggel.',
    docs: '/docs/szamla-letrehozas/beallitasok-es-szabalyok/bizonylattipusok',
  },
  {
    slug: 'devizas-szamla',
    title: 'Devizás számla EU-s vevőnek',
    group: 'Számlák',
    description: 'Euróban kiállított angol nyelvű számla, közösségi adószámmal és MNB árfolyammal.',
    docs: '/docs/szamla-letrehozas/beallitasok-es-szabalyok/penznemek',
  },
  {
    slug: 'elonezet',
    title: 'Számlaelőnézet',
    group: 'Számlák',
    description: 'PDF előnézet kiállítás nélkül: a fiókban nem jön létre bizonylat.',
    docs: '/docs/szamla-letrehozas/beallitasok-es-szabalyok/elonezet',
  },
  {
    slug: 'sztorno',
    title: 'Számla sztornózása',
    group: 'Számlák',
    description: 'Számla kiállítása, sztornózása, és a sztornózott állapot ellenőrzése.',
    docs: '/docs/szamla-sztorno/minta',
  },
  {
    slug: 'befizetes',
    title: 'Befizetések rögzítése',
    group: 'Számlák',
    description: 'Egy befizetés, több részlet egyszerre, majd a befizetések törlése.',
    docs: '/docs/befizetes-rogzitese/minta',
  },
  {
    slug: 'pdf-lekeres',
    title: 'PDF lekérése utólag',
    group: 'Számlák',
    description: 'Számla PDF nélkül, majd a PDF lekérése rendelésszám alapján.',
    docs: '/docs/bizonylat-pdf/minta',
  },
  {
    slug: 'szamla-adatai',
    title: 'Számla adatainak lekérése',
    group: 'Számlák',
    description: 'Fejléc, összegek és befizetések lekérése; find nem létező rendelésre.',
    docs: '/docs/szamla-adatai/minta',
  },
  {
    slug: 'dijbekero-torlese',
    title: 'Díjbekérő törlése',
    group: 'Számlák',
    description: 'Díjbekérő törlése rendelésszám alapján, és a második törlés hibája.',
    docs: '/docs/dijbekero-torlese/minta',
  },
  {
    slug: 'nyugta',
    title: 'Nyugta kiállítása',
    group: 'Nyugták',
    description: 'Pénztári nyugta hívásazonosítóval, két áfakulccsal, alapbeállításokkal.',
    docs: '/docs/nyugta-letrehozas/minta',
  },
  {
    slug: 'nyugta-sztorno',
    title: 'Nyugta sztornózása',
    group: 'Nyugták',
    description: 'Nyugta kiállítása, majd sztornó nyugta a hivatkozással.',
    docs: '/docs/nyugta-sztorno/minta',
  },
  {
    slug: 'nyugta-lekerdezes',
    title: 'Nyugta lekérdezése',
    group: 'Nyugták',
    description: 'Lekérdezés nyugtaszám és rendelésszám alapján, find nem létező nyugtára.',
    docs: '/docs/nyugta-lekerdezes/minta',
  },
  {
    slug: 'nyugta-kikuldes',
    title: 'Nyugta kiküldése e-mailben',
    group: 'Nyugták',
    description: 'Nyugta elküldése a vevőnek saját tárggyal és válaszcímmel.',
    docs: '/docs/nyugta-kikuldes/minta',
  },
  {
    slug: 'adoszam',
    title: 'Adószám lekérdezése',
    group: 'NAV',
    description: 'Cégadatok a NAV-tól, és a vevő adatainak kitöltése a válaszból.',
    docs: '/docs/adoszam-lekerdezes/minta',
  },
  {
    slug: 'hibakezeles-idempotens',
    title: 'Idempotens számlázás hiba után',
    group: 'Hibakezelés',
    description: 'Részleges siker (56) után a find megtalálja a számlát, dupla számla nem készül.',
    docs: '/docs/alapok/hibakezeles',
  },
  {
    slug: 'hibakezeles-validacio',
    title: 'Validációs hibák',
    group: 'Hibakezelés',
    description: 'Kliensoldali és szerveroldali hibák kategóriával, kóddal és javítási tippel.',
    docs: '/docs/alapok/hibakezeles',
  },
  {
    slug: 'kulcs-ellenorzes',
    title: 'Agent kulcs ellenőrzése',
    group: 'Hibakezelés',
    description: 'verifyCredentials jó és rossz kulccsal, és a nagybetűs kulcs elutasítása.',
    docs: '/docs/alapok/hitelesites',
  },
  {
    slug: 'hookok',
    title: 'Hookok és újrapróbálás',
    group: 'Hibakezelés',
    description: 'Naplózás hookokkal, miközben a kassza egy hálózati hiba után újrapróbál.',
    docs: '/docs/alapok/halozat-es-biztonsag',
  },
  {
    slug: 'munkamenet',
    title: 'Közös session több kliens között',
    group: 'Eszközök',
    description: 'Egyedi cookie store: a második kliens is újrahasznosítja a session cookie-t.',
    docs: '/docs/alapok/munkamenet',
  },
  {
    slug: 'mock-kliens',
    title: 'Mock kliens tesztekhez',
    group: 'Eszközök',
    description: 'createMockKassza: hívásnapló, bizonylatok, és szimulált hálózati hiba.',
    docs: '/docs/kiegeszitok/teszteles',
  },
  {
    slug: 'kerekites',
    title: 'Kerekítés és összegzés',
    group: 'Eszközök',
    description: 'Nettó és bruttó alapú számítás, nyugta kerekítés, deviza, áfabontás.',
    docs: '/docs/kiegeszitok/penzszamitas',
  },
  {
    slug: 'validatorok',
    title: 'Validátorok',
    group: 'Eszközök',
    description: 'Adószám CDV, bankszámla, IBAN, EU adószám és cím feldolgozása.',
    docs: '/docs/kiegeszitok/validatorok',
  },
  {
    slug: 'ipn',
    title: 'IPN fizetési értesítés',
    group: 'Eszközök',
    description: 'Webhook kérés feldolgozása és a Számlázz.hu IP-címének ellenőrzése.',
    docs: '/docs/befizetes-rogzitese/ipn',
  },
  {
    slug: 'pdf-tarhely',
    title: 'PDF mentése tárhelyre',
    group: 'Eszközök',
    description: 'A számla PDF-je dátum szerinti kulccsal egy memóriás tárhelyre.',
    docs: '/docs/kiegeszitok/pdf-tarhely',
  },
]

export function findExample(slug: string): ExampleMeta | undefined {
  return EXAMPLES.find((example) => example.slug === slug)
}
