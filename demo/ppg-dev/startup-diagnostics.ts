import { Socket } from "node:net";

export async function ensurePortAvailable(args: {
  envVar: string;
  port: number;
  serviceName: string;
}): Promise<void> {
  const [ipv4InUse, ipv6InUse] = await Promise.all([
    isLocalPortInUse({ host: "127.0.0.1", port: args.port }),
    isLocalPortInUse({ host: "::1", port: args.port }),
  ]);

  if (ipv4InUse || ipv6InUse) {
    throw new Error(formatPortInUseMessage(args));
  }
}

export function formatPortInUseMessage(args: {
  envVar: string;
  port: number;
  serviceName: string;
}): string {
  const { envVar, port, serviceName } = args;

  return `${serviceName} could not start because port ${port} is already in use.
This usually means another \`pnpm demo:ppg\` process is still running.
Stop the existing demo process or set \`${envVar}\` to a different port, then retry.`;
}

export function addDemoStartupFailureHint(args: {
  appPort: number;
  errorMessage: string;
}): string {
  const { appPort, errorMessage } = args;

  if (!errorMessage.includes("startLocalDurableStreamsServer")) {
    return errorMessage;
  }

  return `${errorMessage}
[demo] hint: Prisma Dev could not start its local Streams server. This often happens when another Studio demo is already running.
[demo] next step: stop the existing demo process or set \`STUDIO_DEMO_PORT\` to a different port than ${appPort}, then retry.`;
}

async function isLocalPortInUse(args: {
  host: string;
  port: number;
}): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = new Socket();

    const finish = (inUse: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(inUse);
    };

    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", (error: NodeJS.ErrnoException) => {
      switch (error.code) {
        case "ECONNREFUSED":
        case "EHOSTUNREACH":
        case "ENETUNREACH":
          finish(false);
          return;
        default:
          finish(false);
      }
    });

    socket.connect(args.port, args.host);
  });
}
