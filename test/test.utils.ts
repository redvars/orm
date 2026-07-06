import { defaultLogManager } from "../deps.ts";
import { ORM, type TDatabaseConfiguration } from "../mod.ts";
import type ORMClient from "../src/ORMClient.ts";

export const defaultConfig: TDatabaseConfiguration = {
  hostname: "127.0.0.1",
  port: 5432,
  username: "postgres",
  password: "postgres",
  database: "postgres",
};

export const testConfig: TDatabaseConfiguration = {
  ...defaultConfig,
  database: "orm-test-automation",
};

export class Session {
  static #odm: ORM;

  static #odmConnection: ORMClient;

  static setORM(odm: ORM) {
    Session.#odm = odm;
  }

  static getORM(): ORM {
    return Session.#odm;
  }

  static async getClient(
    forceNewConnection: boolean = false,
  ): Promise<ORMClient> {
    if (!this.#odm) {
      this.#odm = new ORM(
        {
          ...testConfig,
          hostname: Deno.env.get("POSTGRES_HOST") || "127.0.0.1",
        },
        logger,
      );
    }

    if (forceNewConnection || !this.#odmConnection) {
      this.#odmConnection = await this.#odm.connect(true);
    }
    return this.#odmConnection;
  }

  static getLogger() {
    return logger;
  }
}

export const logger = defaultLogManager.getLogger("ORMTest", "DEBUG");
