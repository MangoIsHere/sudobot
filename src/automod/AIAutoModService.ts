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

import { Message, PermissionFlagsBits } from "discord.js";
import { google } from "googleapis";
import Service from "../core/Service";
import { HasEventListeners } from "../types/HasEventListeners";
import { log, logError } from "../utils/logger";
import { isImmuneToAutoMod } from "../utils/utils";

export const name = "aiAutoMod";
const discoveryURL = "https://commentanalyzer.googleapis.com/$discovery/rest?version=v1alpha1";

// TODO: Add support for other type of message attributes

export default class AIAutoModService extends Service implements HasEventListeners {
    protected googleClient: any = undefined;

    analyze(client: any, params: any) {
        return new Promise<any>((resolve, reject) => {
            client.comments.analyze(params, (error: any, response: any) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(response);
            });
        });
    }

    async boot() {
        this.googleClient = await google.discoverAPI<any>(discoveryURL);
    }

    async onMessageCreate(message: Message<boolean>) {
        if (!process.env.PERSPECTIVE_API_TOKEN || !message.content?.trim()) {
            return false;
        }

        const config = this.client.configManager.config[message.guildId!]?.ai_automod;

        if (!config?.enabled || !message.deletable) {
            return false;
        }

        if (isImmuneToAutoMod(this.client, message.member!, PermissionFlagsBits.ManageMessages)) {
            return;
        }

        const { max_severe_toxicity, max_threat, max_toxicity } = config.parameters;

        try {
            const response = await this.analyze(this.googleClient, {
                key: process.env.PERSPECTIVE_API_TOKEN,
                resource: {
                    requestedAttributes: {
                        TOXICITY: {},
                        THREAT: {},
                        SEVERE_TOXICITY: {}
                    },
                    comment: {
                        text: message.content
                    },
                    languages: ["en"]
                }
            });

            log(JSON.stringify(response.data.attributeScores, null, 4));

            const threatScore = response.data.attributeScores.THREAT.summaryScore.value * 100;
            const toxicityScore = response.data.attributeScores.TOXICITY.summaryScore.value * 100;
            const severeToxicityScore = response.data.attributeScores.SEVERE_TOXICITY.summaryScore.value * 100;
            const isThreat = threatScore >= max_threat;
            const isToxic = toxicityScore >= max_toxicity;
            const isSeverelyToxic = severeToxicityScore >= max_severe_toxicity;

            if (isThreat || isToxic || isSeverelyToxic) {
                await message.delete();
                await this.client.logger.logAIAutoModMessageDelete({
                    message,
                    toxicityScore,
                    severeToxicityScore,
                    threatScore,
                    isSeverelyToxic,
                    isThreat,
                    isToxic
                });
            }
        } catch (e) {
            logError(e);
        }
    }
}