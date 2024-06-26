import {
    ActivityType, ChannelType, EmbedAuthorOptions, EmbedBuilder, EmbedFooterOptions, Guild,
    GuildChannel, LocaleString, parseEmoji, PartialEmoji, PermissionsBitField
} from 'discord.js';
import { promises } from 'fs';

import { Config, config, Embed } from '../config/config';
import { BotCounters, emojiMatches } from '../utils/otherTypes';
import { BotClient } from './BotClient';

export class ErryFunctions {
  public client: BotClient
  private status: number
  public config: Config
  constructor(client: BotClient) {
    this.client = client;
    this.status = 0
    this.config = config
  }
  public async clearCache() {
      try {
        var keys = await this.client.cache.keys("*")
        for (var key of keys) {
          await this.client.cache.set(key, JSON.stringify({}))
        }
        return true;
      }catch (e) {
          this.client.logger.error(e as Error)
        return false;
      }
  }
  public formatMS(millis: number, ls: LocaleString): string {
    let localization = {
      m: this.client.lang.translate("common.metrics.minutesShort", ls),
      s: this.client.lang.translate("common.metrics.secondsShort", ls),
      h: this.client.lang.translate("common.metrics.hoursShort", ls),
      seconds: this.client.lang.translate("common.metrics.seconds", ls)
    }
    let val = millis < 0 ? true : false;
    if (millis < 0) {
      millis = -millis;
    }
    let s: number | string = Math.floor((millis / 1000) % 60);
    let m: number | string = Math.floor((millis / (1000 * 60)) % 60);
    let h: number | string = Math.floor((millis / (1000 * 60 * 60)) % 24);
    h = h < 10 ? "0" + h : h.toString();
    m = m < 10 ? "0" + m : m.toString();
    s = s < 10 ? "0" + s : s.toString();
    if (h == "00" || h == "0") return val ? "-" + m + `${localization.m} ` + s + `${localization.s} | ` + "-" + Math.floor((millis / 1000)) + ` ${localization.seconds}` : m + `${localization.m} ` + s + `${localization.s} | ` + Math.floor((millis / 1000)) + " Seconds";
    else return val ? "-" + h + `${localization.h} ` + m + `${localization.m} ` + s + `${localization.s} | ` + "-" + Math.floor((millis / 1000)) + ` ${localization.seconds}` : h + `${localization.h} ` + m + `${localization.m} ` + s + `${localization.s} | ` + Math.floor((millis / 1000)) + " Seconds";
  }
  public parseEmojis(stringInput: string, filterDupes: boolean): { str: string; parsed: PartialEmoji | null; }[] {
    const matches = [...stringInput.matchAll(emojiMatches)];
    if(!matches.length) return [];
    const matchedEmojis = matches.map(x => {
      const [unicode, animated, name, id] = x.slice(1);
      const str = id && name ? `<${animated||""}:${name}:${id}>` : unicode;
      return { str, parsed: parseEmoji(str) }
    });
    return filterDupes ? matchedEmojis.reduce((a: { str: string; parsed: PartialEmoji | null; }[], c: { str: string; parsed: PartialEmoji | null; }) => !a.find(item => item.str === c.str) ? a.concat([c]) : a, []) : matchedEmojis;
  }
  public async statusUpdater(): Promise<void> {
    const shardIds = [...this.client.cluster.ids.keys()];
    const { guilds, members } = await this.client.cluster.broadcastEval("this.counters", {timeout: 15000}).then((x: BotCounters[]) => {
      return {
        guilds: x.map(v => v.guilds || 0).reduce((a, b) => a + b, 0),
        members: x.map(v => v.members || 0).reduce((a, b) => a + b, 0)
      }
    }).catch((e) => {
      this.client.logger.error(e);
      return { guilds: 0, members: 0 }
    })
    for (let i = shardIds.length - 1; i >= 0; i--) {
      const shardId = shardIds[i];
      this.status + 1 >= this.config.status.activities.length ? this.status = 0 : this.status += 1
      this.client.logger.debug(`Updating status to index ${this.status}`)
      this.client.user?.setPresence({
          activities: [{ 
            name: `${this.config.status.activities[this.status].text}`
              //.replaceAll("{commandsused}", stats?.commandsUsed)
              //.replaceAll("{songsplayed}", stats?.songsPlayed)
              .replaceAll("{guilds}", String(guilds))
              .replaceAll("{members}", String(members))
              .replaceAll("{shard}", shardId)
              .replaceAll("{cluster}", String(this.client.cluster.id)), 
            type: ActivityType[this.config.status.activities[this.status].type],
            url: this.config.status.activities[this.status].url || undefined
          }],
          status: this.config.status.status
      });
    }
  }
  public uniqueArray(arr: any[]): any[] {
    var date = Date.now()
    const result = arr.filter((element, index) => arr.indexOf(element) === index);
    this.client.logger.debug(`Checked for duplicates in ${Date.now()-date}ms`)
    return result;
  }
  public checkPermsForGuild(guild: Guild): {status: boolean, missing?: string[]} {
    var me = guild.members.me
    if (!me) return {status: true};
    var missing = []
    if (me.permissions.has(PermissionsBitField.Flags.SendMessages)) missing.push(PermissionsBitField.Flags.SendMessages);
    if (me.permissions.has(PermissionsBitField.Flags.EmbedLinks)) missing.push(PermissionsBitField.Flags.EmbedLinks);
    if (me.permissions.has(PermissionsBitField.Flags.AttachFiles)) missing.push(PermissionsBitField.Flags.AttachFiles);
    if (me.permissions.has(PermissionsBitField.Flags.Connect)) missing.push(PermissionsBitField.Flags.Connect);
    if (me.permissions.has(PermissionsBitField.Flags.ManageChannels)) missing.push(PermissionsBitField.Flags.ManageChannels);
    if (me.permissions.has(PermissionsBitField.Flags.ManageMessages)) missing.push(PermissionsBitField.Flags.ManageMessages);
    if (me.permissions.has(PermissionsBitField.Flags.Speak)) missing.push(PermissionsBitField.Flags.Speak);
    if (me.permissions.has(PermissionsBitField.Flags.UseExternalEmojis)) missing.push(PermissionsBitField.Flags.UseExternalEmojis);
    if (missing?.length >= 1) return {status: false, missing: new PermissionsBitField(missing).toArray()};
    return {status: true};
  }
  public checkPermsForChannel(channel: GuildChannel): {status: boolean, missing?: string[]} {
    const user = channel.guild.members.me
    if (user) var me = channel.permissionsFor(user)
    else return {status: true};
    var missing = []
    if (textBasedCats.includes(channel.type)) {
      if (me.has(PermissionsBitField.Flags.SendMessages)) missing.push(PermissionsBitField.Flags.SendMessages);
      if (me.has(PermissionsBitField.Flags.EmbedLinks)) missing.push(PermissionsBitField.Flags.EmbedLinks);
      if (me.has(PermissionsBitField.Flags.AttachFiles)) missing.push(PermissionsBitField.Flags.AttachFiles);
      if (me.has(PermissionsBitField.Flags.ManageChannels)) missing.push(PermissionsBitField.Flags.ManageChannels);
      if (me.has(PermissionsBitField.Flags.ManageMessages)) missing.push(PermissionsBitField.Flags.ManageMessages);
      if (me.has(PermissionsBitField.Flags.UseExternalEmojis)) missing.push(PermissionsBitField.Flags.UseExternalEmojis);
    }
    if (voiceBasedCats.includes(channel.type)) {
      if (me.has(PermissionsBitField.Flags.SendMessages)) missing.push(PermissionsBitField.Flags.SendMessages);
      if (me.has(PermissionsBitField.Flags.EmbedLinks)) missing.push(PermissionsBitField.Flags.EmbedLinks);
      if (me.has(PermissionsBitField.Flags.AttachFiles)) missing.push(PermissionsBitField.Flags.AttachFiles);
      if (me.has(PermissionsBitField.Flags.Connect)) missing.push(PermissionsBitField.Flags.Connect);
      if (me.has(PermissionsBitField.Flags.ManageChannels)) missing.push(PermissionsBitField.Flags.ManageChannels);
      if (me.has(PermissionsBitField.Flags.ManageMessages)) missing.push(PermissionsBitField.Flags.ManageMessages);
      if (me.has(PermissionsBitField.Flags.Speak)) missing.push(PermissionsBitField.Flags.Speak);
      if (me.has(PermissionsBitField.Flags.UseExternalEmojis)) missing.push(PermissionsBitField.Flags.UseExternalEmojis);
    }
    if (missing?.length >= 1) return {status: false, missing: new PermissionsBitField(missing).toArray()};
    return {status: true};
  }
  public getFooter(es: Embed, stringurl?: string, customText?: string): EmbedFooterOptions { 
    let text = es.footertext;
    let iconURL: string|undefined = stringurl ? stringurl : es.footericon;
    if (customText) text = customText
    if(!text || text.length < 1) text = `${this.client.user?.username || this.config.botName} | By: rocky_pup`;
    if(!iconURL || iconURL.length < 1) iconURL = `${this.client.user?.displayAvatarURL()}`;
    iconURL = iconURL.trim();
    text = text.trim().substring(0, 2000);
    if(!iconURL.startsWith("https://") && !iconURL.startsWith("http://")) iconURL = this.client.user?.displayAvatarURL();
    if(![".png", ".jpg", ".wpeg", ".webm", ".gif", ".webp"].some(d => iconURL?.toLowerCase().endsWith(d))) iconURL = this.client.user?.displayAvatarURL();
    return { text, iconURL }
  };
  public getAuthor(authorname: string, authoricon?: string, authorurl?: string): EmbedAuthorOptions {
    let name = authorname;
    let iconURL = authoricon;
    let url = authorurl;
    if(!iconURL || iconURL.length < 1) iconURL = `${this.client.user?.displayAvatarURL()}`;
    if(!url || url.length < 1) url = `https://d.erry.xyz`;
    iconURL = iconURL.trim();
    name = `${name.trim().substring(0, 25)}`
    if(!url.startsWith("https://") && !url.startsWith("http://")) url = `https://d.erry.xyz`;
    if(!iconURL.startsWith("https://") && !iconURL.startsWith("http://")) iconURL = this.client.user?.displayAvatarURL();
    if(![".png", ".jpg", ".wpeg", ".webm", ".gif"].some(d => iconURL?.toLowerCase().endsWith(d))) iconURL = this.client.user?.displayAvatarURL();
    return { name: name, iconURL: iconURL, url: url }
  };
}


export async function walks(path: string, recursive: boolean = true): Promise<string[]> {
  let files: string[] = [];
  const items = await promises.readdir(path, { withFileTypes: true });
  for (const item of items) {
      if (item.isDirectory() && recursive) {
          files = [ ...files, ...(await walks(`${path}/${item.name}`)) ];
      } else if(item.isFile()) {
          files.push(`${path}/${item.name}`);
      }
  }
  return files;
};

export const textBasedCats = [ChannelType.GuildText, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.GuildCategory, ChannelType.GuildAnnouncement];
export const voiceBasedCats = [ChannelType.GuildStageVoice, ChannelType.GuildVoice];

export class ErryErrorEmbed extends EmbedBuilder {
  constructor(es: Embed, exclude?: {footer?: boolean, timestamp?: boolean}) {
    super();
    this.setColor(es.wrongcolor);
    !exclude?.footer && this.setFooter({text: es.footertext, iconURL: !es.footericon || es.footericon == "" ? undefined : es.footericon})
    !exclude?.timestamp && this.setTimestamp()
  }
}
export class ErrySuccessEmbed extends EmbedBuilder {
  constructor(es: Embed, exclude?: {footer?: boolean, timestamp?: boolean}) {
    super();
    this.setColor(es.color);
    !exclude?.footer && this.setFooter({text: es.footertext, iconURL: !es.footericon || es.footericon == "" ? undefined : es.footericon})
    !exclude?.timestamp && this.setTimestamp()
  }
}
export class ErryWarningEmbed extends EmbedBuilder {
  constructor(es: Embed, exclude?: {footer?: boolean, timestamp?: boolean}) {
    super();
    this.setColor(es.warncolor);
    !exclude?.footer && this.setFooter({text: es.footertext, iconURL: !es.footericon || es.footericon == "" ? undefined : es.footericon})
    !exclude?.timestamp && this.setTimestamp()
  }
}