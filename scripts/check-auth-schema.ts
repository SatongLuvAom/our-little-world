import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { createAuth } from "../src/lib/auth";
import { backupTables } from "../src/lib/backup-service";

export async function checkAuthSchema(env: CloudflareEnv) {
  // Use the same ESM adapter registry as Better Auth's dynamic database import in Node.
  const { betterAuth: schemaAuth } = await import("better-auth");
  const options = createAuth(env).options;
  const context = await schemaAuth({
    ...options,
    advanced: {
      ...options.advanced,
      database: { ...options.advanced?.database, validateSchema: true },
    },
  }).$context;
  if (!context.checkSchema)
    throw new Error("Auth adapter does not provide a database schema check");
  await context.checkSchema();
  await env.DB.batch([
    env.DB.prepare(
      "SELECT day,source,bucket,couple_id,route,code,count,first_at,last_at,last_id,version FROM diagnostic_events LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT id,couple_id,user_id,session_id,endpoint_hash,endpoint,p256dh,auth,device,quests,dates,letters,checked_at,last_test_at,last_sent_at,last_status FROM push_subscriptions LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT id,couple_id,user_id,endpoint_hash,event_key,state,attempts,next_attempt_at,status,created_at FROM push_deliveries LIMIT 0",
    ),
    env.DB.prepare("SELECT couple_id,revision FROM couple_revisions LIMIT 0"),
    env.DB.prepare(
      "SELECT id,couple_id,manifest,expected_revision,part_count,state,expires_at FROM backup_jobs LIMIT 0",
    ),
    env.DB.prepare("SELECT job_id,part_index,bytes FROM backup_parts LIMIT 0"),
    env.DB.prepare(
      "SELECT job_id,part_index,row_index,table_name,data,photo FROM backup_rows LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT couple_id,name,feeds,last_fed,wearing,version FROM couple_pets LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT couple_id,id,actor_id,fed_at FROM pet_feeds LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT couple_id,item_id,purchase_id,acquired_at FROM pet_inventory LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT id,title,detail,metric,target FROM achievement_catalog LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT couple_id,achievement_id,unlocked_at FROM couple_achievements LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT id,couple_id,author_id,title,day,note,photo,photo_hash,created_at FROM memories LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT id,couple_id,author_id,title,body,open_on,created_at FROM love_letters LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT couple_id,user_id,day,mood,note,version FROM daily_moods LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT id,couple_id,title,assignee_id,due,repeat,hearts,version,deleted_at,created_at FROM quests LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT id,title,detail,icon,cost,active,category FROM reward_catalog LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT couple_id,id,kind,actor_id,quest_id,period,reward_id,title,amount,created_at FROM heart_entries LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT couple_id,balance,completion_count FROM heart_wallets LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT id,couple_id,title,target_cents,due,version,created_at FROM savings_goals LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT couple_id,id,goal_id,actor_id,contributor_id,kind,amount_cents,reverses_id,note,created_at FROM savings_entries LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT couple_id,goal_id,contributor_id,total_cents FROM savings_balances LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT id,couple_id,title,place,day,time,budget_cents,version,deleted_at,created_at FROM planned_dates LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT id,couple_id,title,category,done,version,deleted_at,created_at FROM planned_wishes LIMIT 0",
    ),
    env.DB.prepare(
      "SELECT id,couple_id,title,day,event_kind,version,deleted_at,created_at FROM planned_events LIMIT 0",
    ),
  ]);
  const required = [
    "diagnostics_by_couple",
    "push_due_devices",
    "push_by_user",
    "push_session_insert",
    "push_session_update",
    "push_device_limit",
    "push_delivery_expiry",
    "backup_restore_guard",
    "backup_rows_table",
    "backup_couple_created",
    "backup_couple_updated",
    ...[...Object.keys(backupTables), "couple_members"].flatMap((table) =>
      ["insert", "update", "delete"].map(
        (operation) => "backup_revision_" + table + "_" + operation,
      ),
    ),
    "pet_feed_immutable",
    "pet_feed_cooldown",
    "pet_feed_apply",
    "pet_purchase_guard",
    "pet_purchase_apply",
    "memories_by_couple",
    "letters_by_couple",
    "moods_by_couple_day",
    "one_quest_award_per_period",
    "heart_history",
    "quests_by_couple",
    "heart_entry_immutable",
    "heart_balance_nonnegative",
    "heart_wallet_apply",
    "quest_repeat_locked",
    "savings_goals_by_couple",
    "one_savings_reversal",
    "savings_history",
    "savings_entry_immutable",
    "savings_reversal_valid",
    "savings_balance_guard",
    "savings_balance_apply",
    "planned_dates_by_couple",
    "planned_wishes_by_couple",
    "planned_events_by_couple",
  ];
  const schema = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type IN ('index','trigger')",
  ).all<{ name: string }>();
  const names = new Set(schema.results.map((row) => row.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length)
    throw Error("Quest schema missing: " + missing.join(", "));
}

async function main() {
  const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  const database = config.d1_databases.find(
    (item: { binding: string }) => item.binding === "DB",
  );
  if (!database?.database_id) throw new Error("Missing DB binding");
  await mkdir(".wrangler", { recursive: true });
  const path = resolve(
    ".wrangler",
    "schema-check-" + crypto.randomUUID() + ".jsonc",
  );
  await writeFile(
    path,
    JSON.stringify({
      name: config.name,
      account_id: config.account_id,
      compatibility_date: config.compatibility_date,
      compatibility_flags: config.compatibility_flags,
      vars: config.vars,
      d1_databases: [
        {
          ...database,
          remote: true,
          migrations_dir: resolve(database.migrations_dir),
        },
      ],
    }),
    { flag: "wx" },
  );
  try {
    console.log(
      "Checking remote D1 Auth + Quest + Planning + Journal + Pet + Backup + Push schema (read-only): " +
        database.database_name,
    );
    const platform = await getPlatformProxy<CloudflareEnv>({
      configPath: path,
      persist: false,
      remoteBindings: true,
      envFiles: [],
    });
    try {
      await checkAuthSchema({
        ...platform.env,
        // Schema inspection needs configuration, never production signing credentials.
        BETTER_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
      });
      console.log(
        "Auth + Quest + Planning + Journal + Pet + Backup + Push schema check passed.",
      );
    } finally {
      await platform.dispose();
    }
  } finally {
    await unlink(path);
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Auth schema check failed",
    );
    process.exitCode = 1;
  });
