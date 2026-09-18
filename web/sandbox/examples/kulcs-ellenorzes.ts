import { createKassza, isSzamlazzError } from 'kassza'

const jo = createKassza()
console.log('Környezeti változóból olvasott kulcs:', await jo.verifyCredentials())

const rossz = createKassza({ agentKey: 'rossz-kulcs-1234' })
console.log('Hibás kulcs:', await rossz.verifyCredentials())

try {
  createKassza({ agentKey: 'NagyBetusKulcs' })
} catch (error) {
  if (!isSzamlazzError(error)) throw error
  console.log(error.category, error.message)
}
