import * as https from 'https';

export function postSoap(
  url: string,
  soapActionNamespace: string,
  envelope: string,
  agent: https.Agent,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { hostname, pathname, search, port } = new URL(url);
    const body = Buffer.from(envelope, 'utf-8');

    const req = https.request(
      {
        hostname,
        path: pathname + search,
        port: port || 443,
        method: 'POST',
        agent,
        headers: {
          'Content-Type': `application/soap+xml; charset=utf-8; action="${soapActionNamespace}"`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf-8');
          if ((res.statusCode ?? 0) >= 400) {
            reject(
              new Error(
                `SEFAZ retornou HTTP ${res.statusCode}: ${responseBody.slice(0, 500)}`,
              ),
            );
            return;
          }
          resolve(responseBody);
        });
      },
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
