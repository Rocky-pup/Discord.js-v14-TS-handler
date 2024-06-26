import { ErrySuccessEmbed } from '../../../../structures/Functions';
import { CommandExport } from '../../../../utils/otherTypes';

export default {
    async execute(client, interaction, es, ls, GuildSettings) {
        await interaction.reply({
            embeds: [
                new ErrySuccessEmbed(es)
                    .setDescription(client.lang.translate("commands.info_bot_ping.reply", ls, {ping: `${client.ws.ping}`, dbping: `${await client.db.getPing()}`}))
            ]
        })
    }
} as CommandExport