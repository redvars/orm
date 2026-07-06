import { ORM } from "../mod.ts";
import { defaultLogManager } from "../deps.ts";
const logger = defaultLogManager.getLogger("ORMDemo", "DEBUG");

export default function () {
  return new ORM(
    {
      database: "school-database",
      username: "postgres",
      password: "postgres",
      hostname: "localhost",
      port: 5432,
    },
    logger,
  );
}
