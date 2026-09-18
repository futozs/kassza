import {
  isValidEuVatNumber,
  isValidHungarianBankAccount,
  isValidHungarianIban,
  parseHungarianAddress,
  parseHungarianTaxNumber,
} from 'kassza/validators'

console.log('Érvényes adószám:', parseHungarianTaxNumber('12345676-2-41'))
console.log('Hibás ellenőrző számjegy:', parseHungarianTaxNumber('12345678-2-41'))
console.log('Bankszámla:', isValidHungarianBankAccount('11773016-11111018'))
console.log('IBAN:', isValidHungarianIban('HU42 1177 3016 1111 1018 0000 0000'))
console.log('EU adószám:', isValidEuVatNumber('DE123456789'))
console.log('Cím:', parseHungarianAddress('1111 Budapest, XI. kerület, Fő utca 1.'))
