import * as _gen from "medior/_generated";
import { startServers } from "medior/server";

export const serverRouter = _gen.trpc.mergeRouters(
  _gen.serverRouter,
  _gen.trpc.router({
    reloadServers: _gen.serverEndpoint((args) => startServers(args)),
  })
);
export type ServerRouter = typeof serverRouter;
