import { assert, assertRejects, describe, it } from "../../../test_deps.ts";
import { ORM } from "../../../mod.ts";
import { defaultConfig } from "../../test.utils.ts";

describe({
  name: "ORM Connection",
  fn: () => {
    it("should establish a connection", async () => {
      const orm = new ORM({
        ...defaultConfig,
        database: "orm-connection-test",
      });
      let client;
      try {
        client = await orm.connect(true);
      } catch (_error) {
        assert(false, "connection failed");
      } finally {
        if (client) client.closeConnection();
      }
    });

    it("should reject the connection request", async () => {
      const orm = new ORM({
        ...defaultConfig,
        port: 80,
      });
      await assertRejects(async () => {
        await orm.connect();
      }, Error);
    });
  },
});
