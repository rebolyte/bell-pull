/**
 * Example RPC service using Cap'n Web
 * Demonstrates type sharing between frontend and backend
 */

import { RpcTarget } from "capnweb";
import type { ExampleRpcMethods } from "../types/shared.ts";

let counter = 0;

export class ExampleRpcService extends RpcTarget implements ExampleRpcMethods {
  getCounter(): Promise<number> {
    return Promise.resolve(counter);
  }

  incrementCounter(): Promise<number> {
    counter++;
    return Promise.resolve(counter);
  }

  decrementCounter(): Promise<number> {
    counter--;
    return Promise.resolve(counter);
  }

  resetCounter(): Promise<number> {
    counter = 0;
    return Promise.resolve(counter);
  }
}
