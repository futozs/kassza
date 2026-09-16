import { FAKE_PDF_BYTES, type MockResponse, xmlSuccessResponse } from '../../tests/helpers'
import { bytesToBase64 } from '../core/binary'

export const RECEIPT_RESPONSE_NAMESPACE = 'http://www.szamlazz.hu/xmlnyugtavalasz'
export const SEND_RESPONSE_NAMESPACE = 'http://www.szamlazz.hu/xmlnyugtasendvalasz'

const FAKE_PDF_BASE64: string = bytesToBase64(FAKE_PDF_BYTES)

export function receiptResponse(inner: string): MockResponse {
  return xmlSuccessResponse('xmlnyugtavalasz', RECEIPT_RESPONSE_NAMESPACE, inner)
}

export const RECEIPT_WITH_PDF_INNER: string = `  <sikeres>true</sikeres>
  <hibakod></hibakod>
  <hibauzenet></hibauzenet>
  <nyugtaPdf>${FAKE_PDF_BASE64.slice(0, 10)}
${FAKE_PDF_BASE64.slice(10)}</nyugtaPdf>
  <nyugta>
    <alap>
      <id>123456</id>
      <hivasAzonosito>rendeles-42</hivasAzonosito>
      <nyugtaszam>NYGT-2017-123</nyugtaszam>
      <tipus>NY</tipus>
      <stornozott>false</stornozott>
      <kelt>2015-12-01</kelt>
      <fizmod>készpénz</fizmod>
      <penznem>EUR</penznem>
      <devizabank>MNB</devizabank>
      <devizaarf>210</devizaarf>
      <megjegyzes>Köszönjük a vásárlást</megjegyzes>
      <fokonyvVevo>311</fokonyvVevo>
      <teszt>false</teszt>
      <rendelesSzam>ORD-2026-001</rendelesSzam>
    </alap>
    <tetelek>
      <tetel>
        <azonosito>CICA-1</azonosito>
        <megnevezes>Cicás lábtörlő</megnevezes>
        <mennyiseg>2.0</mennyiseg>
        <mennyisegiEgyseg>db</mennyisegiEgyseg>
        <nettoEgysegar>10000</nettoEgysegar>
        <netto>20000.0</netto>
        <afakulcs>27</afakulcs>
        <afa>5400.0</afa>
        <brutto>25400.0</brutto>
        <fokonyv>
          <arbevetel>911</arbevetel>
          <afa>467</afa>
        </fokonyv>
      </tetel>
      <tetel>
        <megnevezes>Kutyás lábtörlő</megnevezes>
        <mennyiseg>2.0</mennyiseg>
        <mennyisegiEgyseg>db</mennyisegiEgyseg>
        <nettoEgysegar>10000</nettoEgysegar>
        <nettoErtek>20000.0</nettoErtek>
        <afatipus>ÁKK</afatipus>
        <afakulcs>0</afakulcs>
        <afaErtek>0.0</afaErtek>
        <bruttoErtek>20000.0</bruttoErtek>
        <fokonyv>
          <arbevetel></arbevetel>
          <afa></afa>
        </fokonyv>
      </tetel>
    </tetelek>
    <kifizetesek>
      <kifizetes>
        <fizetoeszkoz>utalvány</fizetoeszkoz>
        <osszeg>1000.0</osszeg>
        <leiras>OTP SZÉP kártya</leiras>
      </kifizetes>
      <kifizetes>
        <fizetoeszkoz>bankkártya</fizetoeszkoz>
        <osszeg>44400.0</osszeg>
      </kifizetes>
    </kifizetesek>
    <osszegek>
      <afakulcsossz>
        <afakulcs>27</afakulcs>
        <netto>20000</netto>
        <afa>5400</afa>
        <brutto>25400</brutto>
      </afakulcsossz>
      <afakulcsossz>
        <afatipus>ÁKK</afatipus>
        <afakulcs>0</afakulcs>
        <netto>20000</netto>
        <afa>0</afa>
        <brutto>20000</brutto>
      </afakulcsossz>
      <totalossz>
        <netto>40000</netto>
        <afa>5400</afa>
        <brutto>45400</brutto>
      </totalossz>
    </osszegek>
  </nyugta>`

export const RECEIPT_WITH_PDF_RESPONSE: MockResponse = receiptResponse(RECEIPT_WITH_PDF_INNER)

export const REVERSAL_RESPONSE: MockResponse = receiptResponse(`  <sikeres>true</sikeres>
  <nyugta>
    <alap>
      <id>123457</id>
      <nyugtaszam>NYGT-2017-124</nyugtaszam>
      <tipus>SN</tipus>
      <stornozott>false</stornozott>
      <stornozottNyugtaszam>NYGT-2017-123</stornozottNyugtaszam>
      <kelt>2015-12-02</kelt>
      <fizmod>készpénz</fizmod>
      <penznem>Ft</penznem>
      <teszt>true</teszt>
    </alap>
    <tetelek>
      <tetel>
        <megnevezes>Cicás lábtörlő</megnevezes>
        <mennyiseg>-1.0</mennyiseg>
        <mennyisegiEgyseg>db</mennyisegiEgyseg>
        <nettoEgysegar>787.4</nettoEgysegar>
        <netto>-787.4</netto>
        <afakulcs>27</afakulcs>
        <afa>-212.6</afa>
        <brutto>-1000</brutto>
      </tetel>
    </tetelek>
    <osszegek>
      <afakulcsossz>
        <afakulcs>27</afakulcs>
        <netto>-787.4</netto>
        <afa>-212.6</afa>
        <brutto>-1000</brutto>
      </afakulcsossz>
      <totalossz>
        <netto>-787.4</netto>
        <afa>-212.6</afa>
        <brutto>-1000</brutto>
      </totalossz>
    </osszegek>
  </nyugta>`)

export function receiptErrorResponse(code: number, message: string): MockResponse {
  return receiptResponse(
    `  <sikeres>false</sikeres>\n  <hibakod>${code}</hibakod>\n  <hibauzenet><![CDATA[${message}]]></hibauzenet>`,
  )
}

export const SEND_SUCCESS_RESPONSE: MockResponse = xmlSuccessResponse(
  'xmlnyugtasendvalasz',
  SEND_RESPONSE_NAMESPACE,
  '  <sikeres>true</sikeres>\n  <hibakod></hibakod>\n  <hibauzenet></hibauzenet>',
)

export const SEND_ERROR_RESPONSE: MockResponse = xmlSuccessResponse(
  'xmlnyugtasendvalasz',
  SEND_RESPONSE_NAMESPACE,
  '  <sikeres>false</sikeres>\n  <hibakod>7</hibakod>\n  <hibauzenet>Hiányzó adat: emailtargy elem.</hibauzenet>',
)
