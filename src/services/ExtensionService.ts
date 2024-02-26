/**
 * This file is part of SudoBot.
 *
 * Copyright (C) 2021-2023 OSN Developers.
 *
 * SudoBot is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * SudoBot is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with SudoBot. If not, see <https://www.gnu.org/licenses/>.
 */

import { Snowflake } from "discord.js";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import Client from "../core/Client";
import EventListener from "../core/EventListener";
import { Extension } from "../core/Extension";
import Service from "../core/Service";
import type { ClientEvents } from "../types/ClientEvents";
import { log, logDebug, logError, logInfo, logWarn } from "../utils/Logger";

export const name = "extensionService";

const guildIdResolvers: Array<{
    events: ReadonlyArray<keyof ClientEvents>;
    resolver: (args: any) => Snowflake | null | undefined;
}> = [
    {
        events: ["applicationCommandPermissionsUpdate"],
        resolver: ([data]: ClientEvents["applicationCommandPermissionsUpdate"]) => data.guildId
    },
    {
        events: [
            "autoModerationActionExecution",
            "autoModerationRuleCreate",
            "autoModerationRuleDelete",
            "autoModerationRuleUpdate"
        ],
        resolver: ([data]: ClientEvents[
            | "autoModerationActionExecution"
            | "autoModerationRuleCreate"
            | "autoModerationRuleDelete"
            | "autoModerationRuleUpdate"]) => data?.guild.id ?? undefined
    },
    {
        events: [
            "messageCreate",
            "normalMessageCreate",
            "normalMessageDelete",
            "normalMessageUpdate",
            "messageDelete",
            "messageUpdate",
            "interactionCreate"
        ],
        resolver: ([data]: ClientEvents[
            | "messageCreate"
            | "messageDelete"
            | "messageUpdate"
            | "interactionCreate"
            | "normalMessageCreate"
            | "normalMessageUpdate"
            | "normalMessageDelete"]) => data?.guild?.id ?? data?.guildId ?? undefined
    },
    {
        events: ["messageDeleteBulk"],
        resolver: ([data]: ClientEvents["messageDeleteBulk"]) => data.first()?.guildId ?? undefined
    },
    {
        events: ["channelCreate", "channelDelete", "channelUpdate", "channelPinsUpdate"],
        resolver: ([data]: ClientEvents["channelCreate" | "channelDelete" | "channelUpdate" | "channelPinsUpdate"]) =>
            data.isDMBased() ? undefined : data.guildId
    },
    {
        events: ["emojiCreate", "emojiDelete", "emojiUpdate"],
        resolver: ([data]: ClientEvents["emojiCreate" | "emojiDelete" | "emojiUpdate"]) => data?.guild?.id ?? undefined
    },
    {
        events: ["messageReactionAdd", "messageReactionRemove", "messageReactionRemoveEmoji"],
        resolver: ([data]: ClientEvents["messageReactionAdd" | "messageReactionRemove" | "messageReactionRemoveEmoji"]) =>
            data?.message.guildId ?? undefined
    },
    {
        events: ["messageReactionRemoveAll"],
        resolver: ([data]: ClientEvents["messageReactionRemoveAll"]) => data?.guildId ?? undefined
    },
    {
        events: ["guildAuditLogEntryCreate", "guildMembersChunk", "threadListSync"],
        resolver: ([, data]: ClientEvents["guildAuditLogEntryCreate" | "guildMembersChunk" | "threadListSync"]) =>
            data.id ?? undefined
    },
    {
        events: ["guildAvailable", "guildCreate", "guildDelete", "guildUpdate", "guildUnavailable", "guildIntegrationsUpdate"],
        resolver: ([data]: ClientEvents[
            | "guildAvailable"
            | "guildCreate"
            | "guildUpdate"
            | "guildUnavailable"
            | "guildIntegrationsUpdate"]) => data.id ?? undefined
    },
    {
        events: [
            "guildBanAdd",
            "guildBanRemove",
            "guildMemberAdd",
            "guildMemberRemove",
            "guildMemberUpdate",
            "guildMemberAvailable",
            "inviteCreate",
            "inviteDelete",
            "roleCreate",
            "roleDelete"
        ],
        resolver: ([data]: ClientEvents[
            | "guildBanAdd"
            | "guildBanRemove"
            | "guildMemberAdd"
            | "guildMemberRemove"
            | "guildMemberUpdate"
            | "guildMemberAvailable"
            | "inviteCreate"
            | "inviteDelete"
            | "roleCreate"
            | "roleDelete"]) => data.guild?.id ?? undefined
    },
    {
        events: [
            "guildScheduledEventCreate",
            "guildScheduledEventDelete",
            "guildScheduledEventUserAdd",
            "guildScheduledEventUserRemove"
        ],
        resolver: ([data]: ClientEvents[
            | "guildScheduledEventCreate"
            | "guildScheduledEventDelete"
            | "guildScheduledEventUserAdd"
            | "guildScheduledEventUserRemove"]) => data.guild?.id ?? data.guildId ?? undefined
    },
    {
        events: ["guildScheduledEventUpdate"],
        resolver: ([data]: ClientEvents["guildScheduledEventUpdate"]) => data?.guild?.id ?? data?.guildId ?? undefined
    },
    {
        events: ["presenceUpdate", "roleUpdate", "stageInstanceUpdate", "stickerUpdate", "threadUpdate", "voiceStateUpdate"],
        resolver: ([data, data2]: ClientEvents[
            | "presenceUpdate"
            | "roleUpdate"
            | "stageInstanceUpdate"
            | "threadUpdate"
            | "voiceStateUpdate"]) => data?.guild?.id ?? data2.guild?.id ?? undefined
    },
    {
        events: ["stageInstanceDelete", "stageInstanceCreate", "stickerCreate", "stickerDelete", "threadCreate", "threadDelete"],
        resolver: ([data]: ClientEvents[
            | "stageInstanceDelete"
            | "stageInstanceCreate"
            | "stickerCreate"
            | "stickerDelete"
            | "threadCreate"
            | "threadDelete"]) => data?.guild?.id ?? undefined
    },
    {
        events: ["threadMemberUpdate"],
        resolver: ([data, data2]: ClientEvents["threadMemberUpdate"]) =>
            data?.guildMember?.guild.id ?? data2?.guildMember?.guild.id ?? undefined
    },
    {
        events: ["typingStart", "webhookUpdate"],
        resolver: ([data]: ClientEvents["typingStart" | "webhookUpdate"]) => data.guild?.id ?? undefined
    },
    {
        events: ["command"],
        resolver: ([, , , data]: ClientEvents["command"]) => data.guildId ?? undefined
    },
    {
        events: [
            "cacheSweep",
            "debug",
            "error",
            "warn",
            "invalidated",
            "ready",
            "shardReady",
            "shardDisconnect",
            "shardError",
            "shardReconnecting",
            "shardResume"
        ],
        resolver: () => null
    }
];

function getGuildIdResolversMap() {
    const map = new Map<keyof ClientEvents, Function>();

    for (const guildIdResolver of guildIdResolvers) {
        for (const event of guildIdResolver.events) {
            if (map.has(event)) {
                logWarn(`Overlapping Guild ID Resolvers detected: `, event);
                logWarn("This seems to be an internal bug. Please report this issue to the developers.");
            }

            map.set(event, guildIdResolver.resolver);
        }
    }

    return map;
}

const extensionMetadataSchema = z.object({
    main: z.string().optional(),
    commands: z.string().optional(),
    services: z.string().optional(),
    events: z.string().optional(),
    language: z.enum(["typescript", "javascript"]).optional(),
    main_directory: z.string().optional(),
    build_command: z.string().optional(),
    resources: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    id: z.string({ required_error: "Extension ID is required" }),
    icon: z.string().optional(),
    readmeFileName: z.string().default("README.md")
});

export default class ExtensionService extends Service {
    protected readonly extensionsPath = process.env.EXTENSIONS_DIRECTORY;
    protected readonly guildIdResolvers = getGuildIdResolversMap();

    async boot() {
        if (!this.extensionsPath || !existsSync(this.extensionsPath)) {
            logDebug("No extensions found");
            await this.initializeConfigService();
            return;
        }

        const extensionsIndex = path.join(this.extensionsPath, "index.json");

        if (existsSync(extensionsIndex)) {
            await this.loadExtensionsFromIndex(extensionsIndex);
            return;
        }

        await this.loadExtensions();
    }

    async onInitializationComplete(extensions: Extension[]) {
        await this.client.configManager.registerExtensionConfig(extensions);
        return this.initializeConfigService();
    }

    initializeConfigService() {
        return this.client.configManager.manualBoot();
    }

    async loadExtensionsFromIndex(extensionsIndex: string) {
        const { extensions } = JSON.parse(await fs.readFile(extensionsIndex, "utf-8"));
        const loadInfoList = [];
        const extensionInitializers = [];

        for (const { entry, commands, events, name, services, id } of extensions) {
            logInfo("Loading extension initializer (cached): ", name);
            const loadInfo = {
                extensionPath: entry,
                commands,
                events,
                extensionName: name,
                services,
                extensionId: id,
                extension: null as unknown as Extension
            };

            loadInfoList.push(loadInfo);
            loadInfo.extension = await this.loadExtensionInitializer(loadInfo);
            extensionInitializers.push(loadInfo.extension);
        }

        await this.onInitializationComplete(extensionInitializers);

        for (const loadInfo of loadInfoList) {
            await this.loadExtension(loadInfo);
        }
    }

    async loadExtensions() {
        if (!this.extensionsPath) {
            return;
        }

        const extensions = await fs.readdir(this.extensionsPath);
        const loadInfoList = [];
        const extensionInitializers = [];

        for (const extensionName of extensions) {
            const extensionDirectory = path.resolve(this.extensionsPath, extensionName);
            const isDirectory = (await fs.lstat(extensionDirectory)).isDirectory();

            if (!isDirectory || extensionName === ".extbuilds") {
                continue;
            }

            logInfo("Loading extension: ", extensionName);
            const metadataFile = path.join(extensionDirectory, "extension.json");

            if (!existsSync(metadataFile)) {
                logError(`Extension ${extensionName} does not have a "extension.json" file!`);
                process.exit(-1);
            }

            const parseResult = extensionMetadataSchema.safeParse(
                JSON.parse(await fs.readFile(metadataFile, { encoding: "utf-8" }))
            );

            if (!parseResult.success) {
                logError(`Error parsing extension metadata for extension ${extensionName}`);
                logError(parseResult.error);
                continue;
            }

            const {
                main_directory = "./build",
                commands = `./${main_directory}/commands`,
                events = `./${main_directory}/events`,
                services = `./${main_directory}/services`,
                main = `./${main_directory}/index.js`,
                id
            } = parseResult.data;

            const loadInfo = {
                extensionName,
                extensionId: id,
                extensionPath: path.join(extensionDirectory, main),
                commandsDirectory: path.join(extensionDirectory, commands),
                eventsDirectory: path.join(extensionDirectory, events),
                servicesDirectory: path.join(extensionDirectory, services),
                extension: null as unknown as Extension
            };

            loadInfo.extension = await this.loadExtensionInitializer(loadInfo);
            loadInfoList.push(loadInfo);
            extensionInitializers.push(loadInfo.extension);
        }

        await this.onInitializationComplete(extensionInitializers);

        for (const loadInfo of loadInfoList) {
            await this.loadExtension(loadInfo);
        }
    }

    async loadExtensionInitializer({
        extensionName,
        extensionId,
        extensionPath
    }: {
        extensionPath: string;
        extensionName: string;
        extensionId: string;
    }) {
        logDebug("Attempting to load extension initializer: ", extensionName, extensionId);
        const { default: ExtensionClass }: { default: new (client: Client) => Extension } = await import(extensionPath);
        return new ExtensionClass(this.client);
    }

    async loadExtension({
        commandsDirectory,
        eventsDirectory,
        commands,
        events,
        extensionName,
        services,
        servicesDirectory,
        extensionId,
        extension
    }: LoadInfo) {
        logDebug("Attempting to load extension: ", extensionName, extensionId);

        const commandPaths = await extension.commands();
        const eventPaths = await extension.events();
        const servicePaths = await extension.services();

        if (servicePaths === null) {
            if (servicesDirectory) {
                if (existsSync(servicesDirectory)) {
                    await this.client.serviceManager.loadServiceFromDirectory(servicesDirectory);
                }
            } else if (services) {
                for (const servicePath of services) {
                    await this.client.serviceManager.loadService(servicePath);
                }
            }
        } else {
            for (const servicePath of servicePaths) {
                await this.client.serviceManager.loadService(servicePath);
            }
        }

        if (commandPaths === null) {
            if (commandsDirectory) {
                if (existsSync(commandsDirectory)) {
                    await this.client.dynamicLoader.loadCommands(commandsDirectory);
                }
            } else if (commands) {
                for (const commandPath of commands) {
                    await this.client.dynamicLoader.loadCommand(commandPath);
                }
            }
        } else {
            for (const commandPath of commandPaths) {
                await this.client.dynamicLoader.loadCommand(commandPath);
            }
        }

        if (eventPaths === null) {
            if (eventsDirectory) {
                if (existsSync(eventsDirectory)) {
                    await this.loadEvents(extensionName, eventsDirectory);
                }
            } else if (events) {
                for (const eventPath of events) {
                    await this.loadEvent(extensionName, eventPath);
                }
            }
        } else {
            for (const eventPath of eventPaths) {
                await this.loadEvent(extensionName, eventPath);
            }
        }
    }

    async loadEvents(extensionName: string, directory: string) {
        const files = await fs.readdir(directory);

        for (const file of files) {
            const filePath = path.join(directory, file);
            const isDirectory = (await fs.lstat(filePath)).isDirectory();

            if (isDirectory) {
                await this.loadEvents(extensionName, filePath);
                continue;
            }

            if ((!file.endsWith(".ts") && !file.endsWith(".js")) || file.endsWith(".d.ts")) {
                continue;
            }

            await this.loadEvent(extensionName, filePath);
        }
    }

    async loadEvent(extensionName: string, filePath: string) {
        const { default: Event }: { default: new (client: Client) => EventListener<keyof ClientEvents> } = await import(filePath);
        const event = new Event(this.client);
        this.client.addEventListener(event.name, this.wrapHandler(extensionName, event.name, event.execute.bind(event)));
    }

    wrapHandler<K extends keyof ClientEvents>(extensionName: string, eventName: K, handler: Function, bail?: boolean) {
        return async (...args: ClientEvents[K]) => {
            const guildId: Snowflake | null | undefined = this.guildIdResolvers.get(eventName)?.(args);

            if (guildId === undefined) {
                logError("Invalid event or failed to fetch guild: ", eventName);
                return;
            }

            if (guildId !== null && !this.isEnabled(extensionName, guildId)) {
                log("Extension isn't enabled in this guild: ", guildId);
                return;
            }

            logInfo("Running: " + eventName + " [" + extensionName + "]");

            try {
                return await handler(...args);
            } catch (e) {
                logError(`Extension error: the extension '${extensionName}' seems to cause this exception`);
                logError(e);

                if (bail) {
                    return;
                }
            }
        };
    }

    isEnabled(extensionName: string, guildId: Snowflake) {
        const { disabled_extensions, enabled } = this.client.configManager.config[guildId]?.extensions ?? {};
        const { default_mode } = this.client.configManager.systemConfig.extensions ?? {};
        log(default_mode, enabled);
        return (enabled === undefined ? default_mode === "enable_all" : enabled) && !disabled_extensions?.includes(extensionName);
    }
}

type LoadInfo = (
    | {
          extensionPath: string;
          commandsDirectory: string;
          eventsDirectory: string;
          servicesDirectory: string;
          extensionName: string;
          extensionId: string;
          commands?: never;
          events?: never;
          services?: never;
      }
    | {
          extensionPath: string;
          commandsDirectory?: never;
          eventsDirectory?: never;
          servicesDirectory?: never;
          commands: string[];
          events: string[];
          services: string[];
          extensionName: string;
          extensionId: string;
      }
) & {
    extension: Extension;
};
