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

import { OverwriteType, PermissionsBitField, SlashCommandBuilder, TextChannel } from "discord.js";
import Command, { AnyCommandContext, ArgumentType, CommandMessage, CommandReturn, ValidationRule } from "../../core/Command";
import { logError } from "../../utils/logger";
import { isTextableChannel } from "../../utils/utils";

export default class LockCommand extends Command {
    public readonly name = "lock";
    public readonly validationRules: ValidationRule[] = [
        {
            types: [ArgumentType.Channel],
            optional: true,
            name: "channel",
            typeErrorMessage: "Please provide a valid channel to lock!"
        }
    ];
    public readonly permissions = [PermissionsBitField.Flags.ManageChannels];

    public readonly description = "Locks a channel.";
    public readonly detailedDscription = "This command locks down a channel. If no channel is given, the current channel will be locked.";
    public readonly argumentSyntaxes = [
        "[ChannelID|ChannelMention]",
    ];

    public readonly botRequiredPermissions = [PermissionsBitField.Flags.ManageChannels];

    public readonly slashCommandBuilder = new SlashCommandBuilder()
        .addChannelOption(option => option.setName('channel').setDescription("The channel that will be locked. Default is the current channel"));

    async execute(message: CommandMessage, context: AnyCommandContext): Promise<CommandReturn> {
        const channel: TextChannel = (context.isLegacy ? context.parsedNamedArgs.channel : context.options.getChannel("channel")) ?? message.channel!;

        if (!isTextableChannel(channel)) {
            await this.error(message, "Please provide a valid text channel to lock!");
            return;
        }

        const permissionOverwrites = channel.permissionOverwrites.cache.get(message.guildId!);

        if (permissionOverwrites?.deny.has(PermissionsBitField.Flags.SendMessages)) {
            await this.error(message, "This channel is already locked. Run `-unlock` to unlock this channel.");
            return;
        }

        try {
            await channel.permissionOverwrites.edit(message.guildId!, {
                SendMessages: false
            }, {
                reason: "Locking this channel as the user has run the lock command",
                type: OverwriteType.Role
            });

            await this.deferredReply(message, `${this.emoji('check')} This channel has been locked.`).catch(logError);
        }
        catch (e) {
            await this.error(message, `Failed to lock this channel.`);
        }
    }
}