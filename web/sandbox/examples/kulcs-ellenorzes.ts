import { createKassza } from 'kassza'

const jo = createKassza()
await jo.verifyCredentials()

const rossz = createKassza({ agentKey: 'rossz-kulcs-1234' })
await rossz.verifyCredentials()
