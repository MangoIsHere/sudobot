import { TakesArgument } from "@framework/arguments/ArgumentTypes";
import UserArgument from "@framework/arguments/UserArgument";
import { Command, CommandMessage } from "@framework/commands/Command";
import Context from "@framework/commands/Context";
import { Inject } from "@framework/container/Inject";
import Pagination from "@framework/pagination/Pagination";
import { Colors } from "@main/constants/Colors";
import InfractionManager from "@main/services/InfractionManager";
import PermissionManagerService from "@main/services/PermissionManagerService";
import { Infraction } from "@prisma/client";
import { User, italic, time } from "discord.js";

type InfractionListCommandArgs = {
    user: User;
};

@TakesArgument<InfractionListCommandArgs>({
    names: ["user"],
    types: [UserArgument<true>],
    optional: false,
    errorMessages: [UserArgument.defaultErrors],
    interactionName: "user",
    interactionType: UserArgument<true>
})
class InfractionListCommand extends Command {
    public override readonly name = "infraction::list";
    public override readonly description: string = "List infractions for a user.";
    public override readonly aliases = ["infraction::ls", "infraction::s"];

    @Inject()
    protected readonly infractionManager!: InfractionManager;

    @Inject()
    protected readonly permissionManager!: PermissionManagerService;

    public override async execute(
        context: Context<CommandMessage>,
        args: InfractionListCommandArgs
    ): Promise<void> {
        const infractions: Infraction[] = await this.infractionManager.getUserInfractions(
            args.user.id
        );

        if (infractions.length === 0) {
            await context.error("No infraction found for that user.");
            return;
        }

        const pagination: Pagination<Infraction> = Pagination.withData(infractions)
            .setData(infractions)
            .setLimit(3)
            .setMaxTimeout(Pagination.DEFAULT_TIMEOUT)
            .setMessageOptionsBuilder(({ data, maxPages, page }) => {
                let description = "";

                for (const infraction of data) {
                    description += `### Infraction #${infraction.id}\n`;
                    description += `**Type:** ${this.infractionManager.prettifyInfractionType(infraction.type)}\n`;
                    description += `**Moderator:** ${infraction.moderatorId ? `<@${infraction.moderatorId}> (${infraction.moderatorId})` : italic("Unknown")}\n`;
                    description += `**Reason:**\n${infraction.reason ? infraction.reason.slice(0, 150) + (infraction.reason.length > 150 ? "\n..." : "") : italic("No reason provided")}\n`;
                    description += `**Created at:** ${time(infraction.createdAt)}\n\n`;
                }

                return {
                    embeds: [
                        {
                            author: {
                                name: `Infractions for ${args.user.username}`,
                                icon_url: args.user.displayAvatarURL()
                            },
                            color: Colors.Primary,
                            description,
                            footer: {
                                text: `Page ${page} of ${maxPages} • ${infractions.length} infractions total`
                            }
                        }
                    ]
                };
            });

        const reply = await context.reply(await pagination.getMessageOptions());
        pagination.setInitialMessage(reply);
    }
}

export default InfractionListCommand;