import GuildStore from "@framework/cache/GuildStore";
import { SystemPermissionLikeString } from "@framework/permissions/AbstractPermissionManagerService";
import { prisma } from "@framework/utils/helpers";
import { pick } from "@framework/utils/objects";
import { CommandPermissionOverwrite, CommandPermissionOverwriteAction } from "@prisma/client";
import { PermissionsString, Snowflake } from "discord.js";
import CommandManager from "../services/CommandManager";

export type MinimalCommandPermissionOverwrite = Pick<
    CommandPermissionOverwrite,
    | "requiredChannels"
    | "requiredRoles"
    | "requiredLevel"
    | "requiredDiscordPermissions"
    | "requiredSystemPermissions"
    | "requiredUsers"
>;

export type CommandOverwriteLogic<T> = {
    and?: T[];
    deepAnd?: T[][];
};

export type CachedMinimalCommandPermissionOverwrite = {
    ids: number[];
    requiredChannels: Snowflake[] | null;
    requiredRoles: CommandOverwriteLogic<Snowflake> | null;
    requiredLevel: number | null;
    requiredPermissions: CommandOverwriteLogic<PermissionsString> | null;
    requiredSystemPermissions: CommandOverwriteLogic<SystemPermissionLikeString> | null;
    requiredUsers: CommandOverwriteLogic<Snowflake> | null;
};

export type CachedCommandPermissionOverwrites = {
    allow: CachedMinimalCommandPermissionOverwrite | null;
    deny: CachedMinimalCommandPermissionOverwrite | null;
};

class CommandPermissionOverwriteCacheStore extends GuildStore<
    string,
    CachedCommandPermissionOverwrites | null
> {
    protected override readonly ttl = 1000 * 60 * 60 * 2;

    public constructor(public readonly commandManager: CommandManager) {
        super();
        this.setInterval();
    }

    public async fetch(guildId: Snowflake, name: string) {
        const cached = this.get(guildId, name);

        if (cached && Date.now() - (this.getMetadata(guildId, name)?.timestamp ?? 0) < this.ttl) {
            return cached;
        }

        const commandPermissionOverwrites = await prisma().commandPermissionOverwrite.findMany({
            where: {
                guildId,
                commands: {
                    has: name
                },
                disabled: false
            }
        });

        if (commandPermissionOverwrites.length === 0) {
            this.set(guildId, name, null);
            return null;
        }

        for (const overwrite of commandPermissionOverwrites) {
            const cached = this.makeCache(overwrite);

            for (const command of overwrite.commands) {
                const actualName = this.commandManager.commands.get(command)?.name;

                if (!actualName) {
                    continue;
                }

                const existing = this.get(overwrite.guildId, actualName);
                const merged = this.mergePermissionOverwrites(
                    overwrite.onMatch,
                    existing ?? undefined,
                    cached
                );
                this.set(overwrite.guildId, actualName, merged);
            }
        }

        return this.get(guildId, name) ?? null;
    }

    /**
     * The requirement logic is structured in an array of arrays, where each
     * array is a set of requirements that are checked with the AND operator.
     * And, the elements inside the inner array are checked with the OR operator.
     *
     * [[1, 2], [3, 4], [5, 6], 7] => (1 OR 2) AND (3 OR 4) AND (5 OR 6) AND 7
     */
    protected makeLogicArray<T>(array: Array<T | T[]>): CommandOverwriteLogic<T> {
        const deepAnd = [];
        const and = new Set<T>();

        for (const item of array) {
            if (Array.isArray(item)) {
                deepAnd.push(new Set(item));
                continue;
            }

            and.add(item);
        }

        return {
            and: and.size ? Array.from(and) : undefined,
            deepAnd: deepAnd.length ? deepAnd.map(set => Array.from(set)) : undefined
        };
    }

    protected makeCache(overwrite: CommandPermissionOverwrite) {
        const picked = pick(overwrite, [
            "requiredChannels",
            "requiredRoles",
            "requiredLevel",
            "requiredDiscordPermissions",
            "requiredSystemPermissions",
            "requiredUsers"
        ]) as {
            [K in keyof MinimalCommandPermissionOverwrite]:
                | MinimalCommandPermissionOverwrite[K]
                | null;
        };

        const cache: CachedMinimalCommandPermissionOverwrite = {
            ids: [overwrite.id],
            requiredLevel: picked.requiredLevel,
            requiredChannels: picked.requiredChannels
                ? [...(picked.requiredChannels as Snowflake[])]
                : null,
            requiredRoles: picked.requiredRoles
                ? this.makeLogicArray(picked.requiredRoles as Snowflake[][])
                : null,
            requiredPermissions: picked.requiredDiscordPermissions
                ? this.makeLogicArray(picked.requiredDiscordPermissions as PermissionsString[][])
                : null,
            requiredSystemPermissions: picked.requiredSystemPermissions
                ? this.makeLogicArray(
                      picked.requiredSystemPermissions as SystemPermissionLikeString[][]
                  )
                : null,
            requiredUsers: picked.requiredUsers
                ? this.makeLogicArray(picked.requiredUsers as Snowflake[][])
                : null
        };

        return cache;
    }

    public logicConcat<T>(a: CommandOverwriteLogic<T> | null, b: CommandOverwriteLogic<T> | null) {
        if (!a && !b) {
            return null;
        }

        if (!a) {
            return b;
        }

        if (!b) {
            return a;
        }

        const and = new Set<T>();
        const deepAnd = [];

        if (a.and) {
            for (const item of a.and) {
                and.add(item);
            }
        }

        if (b.and) {
            for (const item of b.and) {
                and.add(item);
            }
        }

        if (a.deepAnd) {
            for (const set of a.deepAnd) {
                deepAnd.push(new Set(set));
            }
        }

        if (b.deepAnd) {
            for (const set of b.deepAnd) {
                deepAnd.push(new Set(set));
            }
        }

        return {
            and: and.size ? Array.from(and) : undefined,
            deepAnd: deepAnd.length ? deepAnd.map(set => Array.from(set)) : undefined
        };
    }

    public concatArrays<T>(a: T[] | null, b: T[] | null) {
        if (!a && !b) {
            return null;
        }

        if (!a) {
            return b;
        }

        if (!b) {
            return a;
        }

        return a.concat(b);
    }

    protected mergePermissionOverwrites(
        onMatch: CommandPermissionOverwriteAction,
        base?: CachedCommandPermissionOverwrites,
        other?: CachedMinimalCommandPermissionOverwrite
    ) {
        if (!base) {
            return {
                allow: onMatch === "ALLOW" && other ? other : null,
                deny: onMatch === "DENY" && other ? other : null
            } satisfies CachedCommandPermissionOverwrites;
        }

        if (!other) {
            return base;
        }

        const target = onMatch === "ALLOW" ? "allow" : "deny";
        const existing = base[target];

        if (!existing) {
            base[target] = other;
        } else {
            base[target] = {
                ids: existing.ids.concat(other.ids),
                requiredChannels: this.concatArrays(
                    other.requiredChannels,
                    existing.requiredChannels
                ),
                requiredRoles: this.logicConcat(other.requiredRoles, existing.requiredRoles),
                requiredLevel: other.requiredLevel ?? existing.requiredLevel,
                requiredPermissions: this.logicConcat(
                    other.requiredPermissions,
                    existing.requiredPermissions
                ),
                requiredSystemPermissions: this.logicConcat(
                    other.requiredSystemPermissions,
                    existing.requiredSystemPermissions
                ),
                requiredUsers: this.logicConcat(other.requiredUsers, existing.requiredUsers)
            };
        }

        return base;
    }
}

export default CommandPermissionOverwriteCacheStore;
