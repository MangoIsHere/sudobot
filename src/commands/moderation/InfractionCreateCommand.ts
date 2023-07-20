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

import { InfractionType } from "@prisma/client";
import { ChatInputCommandInteraction, PermissionsBitField } from "discord.js";
import Command, { CommandReturn, ValidationRule } from "../../core/Command";
import { ChatInputCommandContext } from "../../services/CommandManager";
import { stringToTimeInterval } from "../../utils/utils";

export default class InfractionCreateCommand extends Command {
    public readonly name = "infraction__create";
    public readonly validationRules: ValidationRule[] = [];
    public readonly permissions = [PermissionsBitField.Flags.ModerateMembers, PermissionsBitField.Flags.ViewAuditLog];
    public readonly supportsLegacy: boolean = false;
    public readonly permissionMode = "or";

    async execute(interaction: ChatInputCommandInteraction, context: ChatInputCommandContext): Promise<CommandReturn> {
        const user = interaction.options.getUser("user", true);
        const type = interaction.options.getString("type", true);
        const reason = interaction.options.getString("reason");
        const duration = interaction.options.getString("duration");
        const parsedDuration = duration ? stringToTimeInterval(duration) : null;

        if (parsedDuration && parsedDuration.error) {
            await interaction.reply(`${this.emoji("error")} ${parsedDuration.error} provided in the \`duration\` field`);
            return;
        }

        if (!(type in InfractionType)) {
            await interaction.reply(`${this.emoji("error")} Invalid infraction type provided in the \`type\` field`);
            return;
        }

        await interaction.deferReply();

        const infraction = await this.client.prisma.infraction.create({
            data: {
                userId: user.id,
                guildId: interaction.guildId!,
                moderatorId: interaction.user.id,
                type: type as InfractionType,
                reason,
                metadata: parsedDuration?.result
                    ? {
                          duration: parsedDuration.result * 1000
                      }
                    : undefined,
                expiresAt: parsedDuration?.result ? new Date(parsedDuration?.result * 1000 + Date.now()) : undefined
            }
        });

        await interaction.editReply({
            embeds: [this.client.infractionManager.generateInfractionDetailsEmbed(user, infraction).setTitle("Infraction Created")]
        });
    }
}