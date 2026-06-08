import selfsigned from 'selfsigned';

console.log('Testing selfsigned Root CA and signing...');

async function run() {
  try {
    // 1. Generate Root CA
    console.log('Generating Root CA...');
    const caAttrs = [{ name: 'commonName', value: 'ShadowPay Root CA' }];
    const caOptions = {
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: true }
      ]
    };
    const caPems = await selfsigned.generate(caAttrs, caOptions);
    console.log('Root CA generated!');

    // 2. Generate Server Certificate signed by Root CA
    console.log('Generating Server Cert signed by CA...');
    const serverAttrs = [{ name: 'commonName', value: 'localhost' }];
    const serverOptions = {
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' }
        ]}
      ],
      ca: {
        key: caPems.private,
        cert: caPems.cert
      }
    };
    const serverPems = await selfsigned.generate(serverAttrs, serverOptions);
    console.log('Server Cert generated!');

    // 3. Generate Client Certificate signed by Root CA
    console.log('Generating Client Cert signed by CA...');
    const clientAttrs = [{ name: 'commonName', value: 'ShadowPay Client' }];
    const clientOptions = {
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true },
        { name: 'extKeyUsage', clientAuth: true }
      ],
      ca: {
        key: caPems.private,
        cert: caPems.cert
      }
    };
    const clientPems = await selfsigned.generate(clientAttrs, clientOptions);
    console.log('Client Cert generated!');

    console.log('Root CA Cert starts with:', caPems.cert.substring(0, 40));
    console.log('Server Cert starts with:', serverPems.cert.substring(0, 40));
    console.log('Client Cert starts with:', clientPems.cert.substring(0, 40));
  } catch (err) {
    console.error('Error during generation:', err);
  }
}

run();

