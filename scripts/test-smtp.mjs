import { appendFile, writeFile } from "node:fs/promises";
import net from "node:net";

const port = Number.parseInt(process.env.SMTP_TEST_PORT ?? "2525", 10);
const output = process.env.SMTP_TEST_OUTPUT ?? "/private/tmp/pinvites-mail.log";

await writeFile(output, "", { mode: 0o600 });

const server = net.createServer((socket) => {
  socket.setEncoding("utf8");
  socket.write("220 pinvites-test.local ESMTP ready\r\n");

  let buffer = "";
  let dataMode = false;
  let message = "";

  socket.on("data", (chunk) => {
    buffer += chunk;
    let boundary = buffer.indexOf("\r\n");
    while (boundary >= 0) {
      const line = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      if (dataMode) {
        if (line === ".") {
          dataMode = false;
          const record = `\n----- MESSAGE ${new Date().toISOString()} -----\n${message}`;
          message = "";
          void appendFile(output, record, { mode: 0o600 });
          socket.write("250 2.0.0 accepted as pinvites-test-message\r\n");
        } else {
          message += `${line.startsWith("..") ? line.slice(1) : line}\r\n`;
        }
      } else {
        const command = line.split(/\s+/, 1)[0]?.toUpperCase();
        switch (command) {
          case "EHLO":
            socket.write("250-pinvites-test.local\r\n250 SIZE 5242880\r\n");
            break;
          case "HELO":
          case "MAIL":
          case "RCPT":
          case "RSET":
          case "NOOP":
            socket.write("250 2.0.0 ok\r\n");
            break;
          case "DATA":
            dataMode = true;
            message = "";
            socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
            break;
          case "QUIT":
            socket.end("221 2.0.0 bye\r\n");
            break;
          default:
            socket.write("502 5.5.1 command not implemented\r\n");
        }
      }
      boundary = buffer.indexOf("\r\n");
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`SMTP test server listening on 127.0.0.1:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
