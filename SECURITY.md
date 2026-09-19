# Biztonsági szabályzat

A kassza számlázási hozzáférést (Agent kulcsot) és vevői adatokat kezel, ezért a biztonsági hibákat komolyan vesszük.

## Támogatott verziók

Biztonsági javítást csak a legutóbbi kiadott verzió kap. A csomag még 0.x, ezért érdemes mindig frissíteni.

## Sebezhetőség bejelentése

**Ne nyiss nyilvános issue-t** biztonsági hibához. Használd a GitHub privát bejelentését:

[Sebezhetőség bejelentése](https://github.com/futozs/kassza/security/advisories/new)

A bejelentésben add meg:

- az érintett verziót és a futtatási környezetet (Node, Workers, Bun, Deno),
- a hiba leírását és a reprodukálás lépéseit,
- ha tudod, a lehetséges hatást.

Ne küldj valódi Agent kulcsot, jelszót vagy vevői adatot. Ha egy kulcs kiszivároghatott, előbb cseréld le a Számlázz.hu felületén.

## Mire számíthatsz

- A bejelentést néhány munkanapon belül visszaigazoljuk.
- A megerősített hibához javítást készítünk, és a javított verzió kiadása után nyilvános tájékoztatást (GitHub Security Advisory) teszünk közzé.
- Kérjük, a javítás megjelenéséig ne hozd nyilvánosságra a részleteket.

## Hatókör

A kassza nem hivatalos kliens, ezért a Számlázz.hu rendszerét érintő hibát a [Számlázz.hu](https://www.szamlazz.hu) felé kell jelezni. A kassza csomagjában lévő hibák (kérésépítés, válaszfeldolgozás, IPN ellenőrzés, tárhely- és cookie-adapterek) ide tartoznak.
