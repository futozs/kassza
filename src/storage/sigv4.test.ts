import { describe, expect, test } from 'vitest'
import { presignAwsUrl, sha256Hex, signAwsRequest, toAmzDate } from './sigv4'

const S3_DOC_CREDENTIALS = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
}
const S3_DOC_DATE = new Date('2013-05-24T00:00:00Z')
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

function signatureOf(authorization: string | undefined): string | undefined {
  return authorization?.split('Signature=')[1]
}

describe('AWS SigV4 hivatalos tesztvektorok', () => {
  test('S3 docs: GET Object Range fejléccel', async () => {
    const headers = await signAwsRequest({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: { Range: 'bytes=0-9', 'x-amz-content-sha256': EMPTY_SHA256 },
      credentials: S3_DOC_CREDENTIALS,
      region: 'us-east-1',
      service: 's3',
      date: S3_DOC_DATE,
    })

    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
    expect(headers['x-amz-date']).toBe('20130524T000000Z')
    expect(headers).not.toHaveProperty('host')
  })

  test('S3 docs: PUT Object speciális karakterrel a kulcsban', async () => {
    const headers = await signAwsRequest({
      method: 'PUT',
      url: 'https://examplebucket.s3.amazonaws.com/test$file.text',
      headers: {
        Date: 'Fri, 24 May 2013 00:00:00 GMT',
        'x-amz-storage-class': 'REDUCED_REDUNDANCY',
      },
      body: 'Welcome to Amazon S3.',
      credentials: S3_DOC_CREDENTIALS,
      region: 'us-east-1',
      service: 's3',
      date: S3_DOC_DATE,
    })

    expect(headers['x-amz-content-sha256']).toBe(
      '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072',
    )
    expect(signatureOf(headers.authorization)).toBe(
      '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd',
    )
    expect(headers.authorization).toContain(
      'SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class',
    )
  })

  test('S3 docs: GET Bucket Lifecycle üres értékű query paraméterrel', async () => {
    const headers = await signAwsRequest({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/?lifecycle',
      credentials: S3_DOC_CREDENTIALS,
      region: 'us-east-1',
      service: 's3',
      date: S3_DOC_DATE,
    })

    expect(signatureOf(headers.authorization)).toBe(
      'fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543',
    )
  })

  test('S3 docs: list objects rendezett query paraméterekkel', async () => {
    const headers = await signAwsRequest({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/?prefix=J&max-keys=2',
      credentials: S3_DOC_CREDENTIALS,
      region: 'us-east-1',
      service: 's3',
      date: S3_DOC_DATE,
    })

    expect(signatureOf(headers.authorization)).toBe(
      '34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7',
    )
  })

  test('S3 docs: presigned URL (query string auth)', async () => {
    const url = await presignAwsUrl({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      credentials: S3_DOC_CREDENTIALS,
      region: 'us-east-1',
      service: 's3',
      expiresInSeconds: 86400,
      date: S3_DOC_DATE,
    })

    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    )
  })

  test('SigV4 test suite: get-vanilla', async () => {
    const headers = await signAwsRequest({
      method: 'GET',
      url: 'https://example.amazonaws.com/',
      credentials: {
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      },
      region: 'us-east-1',
      service: 'service',
      date: new Date('2015-08-30T12:36:00Z'),
    })

    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    )
    expect(headers).not.toHaveProperty('x-amz-content-sha256')
  })
})

describe('sigv4 segédfüggvények', () => {
  test('a session tokent aláírt fejlécként és query paraméterként is átadja', async () => {
    const credentials = { ...S3_DOC_CREDENTIALS, sessionToken: 'token/123' }
    const headers = await signAwsRequest({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      credentials,
      region: 'us-east-1',
      service: 's3',
      payloadHash: EMPTY_SHA256,
    })
    const url = await presignAwsUrl({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      credentials,
      region: 'us-east-1',
      service: 's3',
      expiresInSeconds: 60,
    })

    expect(headers['x-amz-security-token']).toBe('token/123')
    expect(headers.authorization).toContain('x-amz-security-token')
    expect(url).toContain('X-Amz-Security-Token=token%2F123')
  })

  test('azonos nevű query paramétereket érték szerint rendezi', async () => {
    const a = await signAwsRequest({
      method: 'GET',
      url: 'https://example.amazonaws.com/?b=2&a=2&a=1',
      credentials: S3_DOC_CREDENTIALS,
      region: 'us-east-1',
      service: 's3',
      date: S3_DOC_DATE,
    })
    const b = await signAwsRequest({
      method: 'GET',
      url: 'https://example.amazonaws.com/?a=1&a=2&b=2',
      credentials: S3_DOC_CREDENTIALS,
      region: 'us-east-1',
      service: 's3',
      date: S3_DOC_DATE,
    })

    expect(a.authorization).toBe(b.authorization)
  })

  test('toAmzDate és sha256Hex', async () => {
    expect(toAmzDate(new Date('2026-09-16T08:09:10.123Z'))).toBe('20260916T080910Z')
    expect(await sha256Hex(new Uint8Array())).toBe(EMPTY_SHA256)
  })
})
