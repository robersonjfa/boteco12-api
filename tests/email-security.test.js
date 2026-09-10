const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const emailSource = fs.readFileSync(
  path.resolve(__dirname, '../src/lib/email.ts'),
  'utf8'
)

test('SMTP não carrega conteúdo de arquivos locais ou URLs externas', () => {
  assert.match(emailSource, /disableFileAccess:\s*true/)
  assert.match(emailSource, /disableUrlAccess:\s*true/)
})
