import { ipnOkResponse, isSzamlazzIp, readIpnNotification } from 'kassza/ipn'

const keres = new Request('https://webshop.example.hu/api/szamlazz/ipn', {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    'x-forwarded-for': '3.73.214.98',
  },
  body: new URLSearchParams({
    szlahu_szamlaszam: 'WEB-2026-128',
    szlahu_rendelesszam: 'WEB-58213',
    szlahu_bruttovegosszeg: '19 470',
    szlahu_kifizetettbrutto: '19 470',
    szlahu_fizetesmod: 'átutalás',
    szlahu_kifizdat: '2026-09-17',
  }),
})

console.log(
  'A Számlázz.hu IP-címéről érkezett:',
  isSzamlazzIp(keres.headers.get('x-forwarded-for') ?? ''),
)

const ipn = await readIpnNotification(keres)
console.log(ipn)

if (ipn.isFullyPaid) console.log(`A(z) ${ipn.orderNumber} rendelés teljesen kifizetve.`)

const valasz = ipnOkResponse()
console.log(valasz.status, await valasz.text())
