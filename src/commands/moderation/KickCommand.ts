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

import { ChatInputCommandInteraction, GuildMember, PermissionsBitField, escapeMarkdown } from "discord.js";
import Command, { AnyCommandContext, ArgumentType, CommandMessage, CommandReturn, ValidationRule } from "../../core/Command";
import { createModerationEmbed } from "../../utils/utils";

export default class KickCommand extends Command {
    public readonly name = "kick";
    public readonly validationRules: ValidationRule[] = [
        {
            types: [ArgumentType.GuildMember],
            entityNotNull: true,
            requiredErrorMessage: "You must specify a member to kick!",
            typeErrorMessage: "You have specified an invalid user mention or ID.",
            entityNotNullErrorMessage: "The given member does not exist in the server!",
            name: "member"
        },
        {
            types: [ArgumentType.StringRest],
            optional: true,
            typeErrorMessage: "You have specified an invalid kick reason.",
            lengthMax: 3999,
            name: "reason"
        }
    ];
    public readonly permissions = [PermissionsBitField.Flags.KickMembers];

    async execute(message: CommandMessage, context: AnyCommandContext): Promise<CommandReturn> {
        const member: GuildMember | null = context.isLegacy ? context.parsedNamedArgs.member : context.options.getMember("member");

        if (!member) {
            return {
                __reply: true,
                ephemeral: true,
                content: `Invalid member given. Probably that user isn't a member of this server?`
            };
        }

        const reason: string | undefined = !context.isLegacy ? context.options.getString('reason') ?? undefined : (
            context.parsedNamedArgs.reason ?? undefined
        );

        if (message instanceof ChatInputCommandInteraction)
            await message.deferReply();

        const id = await this.client.infractionManager.createMemberKick(member, {
            guild: message.guild!,
            moderatorId: message.member!.user.id,
            reason,
            notifyUser: context.isLegacy ? true : !context.options.getBoolean('silent'),
            sendLog: true
        });

        if (!id) {
            await this.error(message);
            return;
        }

        await this.deferredReply(message, {
            embeds: [
                await createModerationEmbed({
                    user: member.user,
                    actionDoneName: "kicked",
                    id,
                    description: `**${escapeMarkdown(member.user.tag)}** has been kicked from this server.`,
                    reason,
                })
            ]
        });
    }
}
