console.log('Hello, World!');

const { parseArgs } = require('node:util');

const { values } = parseArgs({
  options: {
    path: { type: 'string' },
  },
  strict: false,
});

if (!values.path) {
  console.error('Uso: node sanitize-and-upload.js --path <dir>');
  process.exit(1);
}

console.log('Path do docs:', values.path);

console.log('CLIENT_ID definido?', !!process.env.STACKSPOT_CLIENT_ID);
console.log('Tamanho:', process.env.STACKSPOT_CLIENT_ID?.length);
