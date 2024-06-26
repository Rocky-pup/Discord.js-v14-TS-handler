import { Shard } from 'discord-cross-hosting';
import { ClusterClient, DjsDiscordClient, getInfo } from 'discord-hybrid-sharding';
import {
    ActivityType, ApplicationCommand, ApplicationCommandType, Client, ClientOptions, Collection,
    ContextMenuCommandBuilder, GatewayIntentBits, GuildResolvable, Partials, PresenceStatusData,
    PresenceUpdateStatus, RESTPostAPIChatInputApplicationCommandsJSONBody,
    RESTPostAPIContextMenuApplicationCommandsJSONBody, ShardClientUtil, SlashCommandBuilder,
    SlashCommandSubcommandBuilder
} from 'discord.js';
import { promises } from 'fs';
import { resolve } from 'path';
import { createClient, RedisClientType } from 'redis';
import { pathToFileURL } from 'url';

import { Config, config } from '../config/config';
import { Emojis, emojis } from '../config/emoji';
import { dirSetup } from '../config/SlashCommandDirSetup';
import {
    BotCounters, Command, commandOptionChoiceNumber, commandOptionChoiceString, ContextCommand,
    optionTypes
} from '../utils/otherTypes';
import { ErryDatabase } from './Database';
import { ErryFunctions, walks } from './Functions';
import {
    ErryLanguage, getSlashCommandDescription, getSlashCommandLocalizations, getSlashCommandName
} from './Language';
import { Logger } from './Logger';

export class BotClient extends Client {
    public config: Config
    public logger: Logger
    public cluster: ClusterClient<DjsDiscordClient>
    public commands: Collection<string, Command|ContextCommand>
    public eventPaths: Collection<string, {eventName: string, path: string}>
    public cache: RedisClientType
    public functions: ErryFunctions
    public db: ErryDatabase
    public allCommands: (RESTPostAPIContextMenuApplicationCommandsJSONBody | RESTPostAPIChatInputApplicationCommandsJSONBody)[]
    public fetchedApplication: ApplicationCommand<{guild: GuildResolvable;}>[]
    public machine?: Shard
    public lang: ErryLanguage
    public emoji: Emojis
    constructor(options?: ClientOptions) {
        super({
            ...getDefaultClientOptions(),
            ...options
        });
        this.config = config
        this.cluster = new ClusterClient(this);
        this.config.bridge_use ? this.machine = new Shard(this.cluster) : null;
        this.logger = new Logger({ prefix: "     Erry    ", ...this.config.logLevel });
        this.commands = new Collection();
        this.eventPaths = new Collection();
        this.allCommands = [];
        this.fetchedApplication = [],
        this.functions = new ErryFunctions(this);
        this.db = new ErryDatabase()
        this.cache = createClient({url: this.config.redis})
        this.lang = new ErryLanguage()
        this.emoji = emojis
        this.init();
    }
    public async init() {
        console.log(`${"-=".repeat(40)}-`);
        this.logger.info(`Loading Languages`);
        await this.lang.init();

        console.log(`${"-=".repeat(40)}-`);
        this.logger.info(`Loading Cache`);
        await this.cache.connect().then(e => {this.logger.debug("✅ Cache ready")});

        console.log(`${"-=".repeat(40)}-`);
        this.logger.info(`Loading Events`);
        await this.loadEvents();

        console.log(`${"-=".repeat(40)}-`);
        this.logger.info(`Loading Commands`);
        await this.loadCommands();

        console.log(`${"-=".repeat(40)}-`);
        this.logger.info(`Loading ContextMenu`);
        await this.loadContextMenu();

        console.log(`${"-=".repeat(40)}-`);
        this.logger.info(`Loading Extenders`);
        await this.loadExtenders();

        return this.emit("ErryLoaded", this);
    }
    public get counters() {
      return {
        guilds: this.guilds.cache.size,
        members: this.guilds.cache.map(x => x.memberCount).reduce((a,b) => a+b,0),
        clusterId: this.cluster.id,
        shardIds: [...this.cluster.ids.keys()],
        ping: this.ws.ping,
        uptime: this.uptime,
      } as BotCounters
    }
    public async loadExtenders() {
      try {
        const paths = await walks(`${process.cwd()}/extenders`);
        await Promise.all(
            paths.map(async (path) => {
                const extender = await import(globalFilePath(resolve(path))).then(x => x.default)
                const name = resolve(path).includes("\\") ? resolve(path).split("\\").reverse()[0] : resolve(path).split("/").reverse()[0];
                this.logger.debug(`✅ Extender Loaded: ${name.replace(".ts", "")}`);
                return extender(this);
            })
        );
      } catch (e) {
        this.logger.error(e as Error);
      }
      return true;
    }
    public async loadEvents() {
      try {
        this.eventPaths.clear();
        const paths = await walks(`${process.cwd()}/events`);
        if (paths.length == 0) return;
        await Promise.all(
            paths.map(async (path) => {
                const event = await import(globalFilePath(resolve(path))).then(x => x.default)
                const splitted =  resolve(path).includes("\\") ? resolve(path).split("\\") : resolve(path).split("/")
                const eventName = splitted.reverse()[0].replace(".ts", "");
                this.eventPaths.set(eventName, { eventName, path: resolve(path) });
                this.logger.debug(`✅ Event Loaded: ${eventName}`);
                return this.on(eventName, event.bind(null, this));
            })
        );
      } catch (e) {
        this.logger.error(e as Error);
      }
      return true;
    }
    public async loadCommands(path = "/commands/slash") {
        try {
          this.allCommands = [];
          this.commands.clear();
          const basePath = `${process.cwd()}${path}`;
          const dirs = await promises.readdir(basePath);
          const dirStats = await Promise.all(dirs.map(dir => promises.lstat(`${basePath}/${dir}`).catch(() => null)));
          
          for (let i = 0; i < dirs.length; i++) {
            const dir = dirs[i];
            const stat = dirStats[i];
            if (!dir.endsWith(".ts") && stat?.isDirectory?.()) {
              const thisDirSetup = dirSetup.find(x => x.Folder.toLowerCase() === dir.toLowerCase());
              if (!thisDirSetup) {
                this.logger.stringError(`Could not find the DirSetup for ${dir}`);
                continue;
              }
              
              const subSlash = new SlashCommandBuilder()
                .setName(String(thisDirSetup.name).toLowerCase())
                .setDescription(String(thisDirSetup.description))
                .setDMPermission(false);
              
              if (thisDirSetup.defaultPermissions) {
                subSlash.setDefaultMemberPermissions(thisDirSetup.defaultPermissions);
              }
              
              if (thisDirSetup.dmPermissions) {
                subSlash.setDefaultMemberPermissions(thisDirSetup.dmPermissions);
              }
              
              if (thisDirSetup.localizations?.length) {
                for (const localization of thisDirSetup.localizations) {
                  if (localization.name) subSlash.setNameLocalization(localization.language, localization.name);
                  if (localization.description) subSlash.setDescriptionLocalization(localization.language, localization.description);
                }
              }
              
              const dirPath = `${basePath}/${dir}`;
              const slashCommands = await promises.readdir(dirPath);
              const commandStats = await Promise.all(slashCommands.map(file => promises.lstat(`${dirPath}/${file}`).catch(e => this.logger.error(e))));
              
              for (let j = 0; j < slashCommands.length; j++) {
                const file = slashCommands[j];
                const commandStat = commandStats[j];
                
                const curPath = `${dirPath}/${file}`;
                if (commandStat?.isDirectory?.()) {
                  const groupPath = curPath;
                  const groupDirSetup = thisDirSetup.groups?.find(x => x.Folder.toLowerCase() == file.toLowerCase())
                  if (!groupDirSetup) {
                    this.logger.stringError(`Could not find the groupDirSetup for ${dir}/${file}`);
                    continue;
                  }
                  const slashCommands = await promises.readdir(groupPath).then(x => x.filter(v => v.endsWith(".ts")));
                  if (slashCommands?.length) {
                    var commands: {[key: string]: Command} = {}
                    for (let sFile of slashCommands) {
                      const groupCurPath = `${groupPath}/${sFile}`;
                      commands[sFile] = await import(globalFilePath(groupCurPath)).then(x => x.default);
                    }
                    subSlash.addSubcommandGroup(Group => {
                      Group.setName(groupDirSetup.name.toLowerCase()).setDescription(groupDirSetup.description || "Temp_Desc");
                      if(groupDirSetup.localizations?.length) {
                        for(const localization of groupDirSetup.localizations) {
                          if(localization.name) Group.setNameLocalization(localization.language, localization.name);
                          if(localization.description) Group.setDescriptionLocalization(localization.language, localization.description);
                        }
                      }
                      for (let sFile of slashCommands) {
                        const command = commands[sFile];
                        if (!command.name) {
                          try {
                            command.name = getSlashCommandName(String(thisDirSetup.name).toLowerCase() + "_" + String(groupDirSetup.name).toLowerCase() + "_" + sFile.split(".ts").join(""))
                          } catch (e) {
                            this.logger.stringError(`${e}`);
                            continue;
                          }
                        }
                        if (!command.description) {
                          try {
                            command.description = getSlashCommandDescription(String(thisDirSetup.name).toLowerCase() + "_" + String(groupDirSetup.name).toLowerCase() + "_" + sFile.split(".ts").join(""))
                          } catch (e) {
                            command.description = "Temp_Desc"
                            this.logger.warn(`There is no description for ${String(thisDirSetup.name).toLowerCase() + "_" + String(groupDirSetup.name).toLowerCase() + "_" + sFile.split(".ts").join("")} slash command in ${config.defaultLanguage} language file`)
                          }
                        }
                        if (!command.localizations) {
                          try {
                            command.localizations = getSlashCommandLocalizations(String(thisDirSetup.name).toLowerCase() + "_" + String(groupDirSetup.name).toLowerCase() + "_" + sFile.split(".ts").join(""))
                          } catch (e) {
                            // nothing cause who need localizations if there is 1 language?
                          }
                        }
                        Group.addSubcommand(Slash => {
                          Slash.setName(command.name).setDescription(command.description);
                          if(command.localizations?.length) {
                            for(const localization of command.localizations) {
                              if(!localization.language) continue;
                              if(localization.name) Slash.setNameLocalization(localization.language, localization.name);
                              if(localization.description) Slash.setDescriptionLocalization(localization.language, localization.description);
                            }
                          }
                          this.buildCommandOptions(command, Slash)
                          return Slash;
                        });
                        command.commandId = this.fetchedApplication?.find?.((c) => c?.name == subSlash.name)?.permissions?.commandId ?? "commandId";
                        command.slashCommandKey = `/${subSlash.name} ${Group.name} ${command.name}`
                        command.mention = `<${command.slashCommandKey}:${command.commandId}>`
                        this.commands.set("groupcmd_" + String(groupDirSetup.name).toLowerCase() + "_" + String(thisDirSetup.name).toLowerCase() + "_" + command.name, command)
                        this.logger.debug(`✅ Group Command Loaded: /${thisDirSetup.name} ${groupDirSetup.name} ${command.name}`);
                      }
                      return Group;
                    });
                  }
                } else {
                  const command = await import(globalFilePath(curPath)).then(x => x.default);
                  if (!command.name) {
                    try {
                      command.name = getSlashCommandName(String(thisDirSetup.name).toLowerCase() + "_" + file.split(".ts").join(""))
                    } catch (e) {
                      this.logger.stringError(`${e}`);
                      continue;
                    }
                  }
                  if (!command.description) {
                    try {
                      command.description = getSlashCommandDescription(String(thisDirSetup.name).toLowerCase() + "_" + file.split(".ts").join(""))
                    } catch (e) {
                      command.description = "Temp_Desc"
                      this.logger.warn(`There is no description for ${String(thisDirSetup.name).toLowerCase() + "_" + file.split(".ts").join("")} slash command in ${config.defaultLanguage} language file`)
                    }
                  }
                  if (!command.localizations) {
                    try {
                      command.localizations = getSlashCommandLocalizations(String(thisDirSetup.name).toLowerCase() + "_" + file.split(".ts").join(""))
                    } catch (e) {
                      // nothing cause who need localizations if there is 1 language?
                    }
                  }
                  subSlash.addSubcommand(Slash => {
                    Slash.setName(command.name as string).setDescription(command.description as string)
                    if(command.localizations?.length) {
                      for(const localization of command.localizations) {
                        if(!localization.language) continue;
                        if(localization.name) Slash.setNameLocalization(localization.language, localization.name);
                        if(localization.description) Slash.setDescriptionLocalization(localization.language, localization.description);
                      }
                    }
                    this.buildCommandOptions(command, Slash)
                    return Slash;
                  });
                  command.commandId = this?.fetchedApplication?.find?.((c) => c?.name == subSlash.name)?.permissions?.commandId ?? "commandId";
                  command.slashCommandKey = `/${subSlash.name} ${command.name}`
                  command.mention = `<${command.slashCommandKey}:${command.commandId}>`
                  this.commands.set("subcmd_" + String(thisDirSetup.name).toLowerCase() + "_" + command.name, command)
                  this.logger.debug(`✅ ⠀⠀Sub Command Loaded: /${thisDirSetup.name} ${command.name}`);
                }
              }
              
              this.allCommands.push(subSlash.toJSON());
            } else {
              const curPath = `${basePath}/${dir}`;
              const command = await import(globalFilePath(curPath)).then(x => x.default);
              if (!command.name) {
                try {
                  command.name = getSlashCommandName(dir.split(".ts").join(""))
                } catch (e) {
                  this.logger.stringError(`${e}`);
                  continue;
                }
              }
              if (!command.description) {
                try {
                  command.description = getSlashCommandDescription(dir.split(".ts").join(""))
                } catch (e) {
                  command.description = "Temp_Desc"
                  this.logger.warn(`There is no description for ${dir.split(".ts").join("")} slash command in ${config.defaultLanguage} language file`)
                }
              }
              if (!command.localizations) {
                try {
                  command.localizations = getSlashCommandLocalizations(dir.split(".ts").join(""))
                } catch (e) {
                  // nothing cause who need localizations if there is 1 language?
                }
              }
              const Slash = new SlashCommandBuilder().setName(command.name as string).setDescription(command.description as string).setDMPermission(false);
              if(command.defaultPermissions) {
                Slash.setDefaultMemberPermissions(command.defaultPermissions);
              }
              if(command.dmPermissions) {
                Slash.setDefaultMemberPermissions(command.dmPermissions);
              }
              if(command.localizations?.length) {
                for(const localization of command.localizations) {
                  if(!localization.language) continue;
                  if(localization.name) Slash.setNameLocalization(localization.language, localization.name);
                  if(localization.description) Slash.setDescriptionLocalization(localization.language, localization.description);
                }
              }
              this.buildCommandOptions(command, Slash);
              command.commandId = this?.fetchedApplication?.find?.((c) => c?.name == command.name)?.permissions?.commandId ?? "commandId";
              command.slashCommandKey = `/${command.name}`
              command.mention = `<${command.slashCommandKey}:${command.commandId}>`
              this.commands.set("slashcmd_" + command.name, command)
              this.logger.debug(`✅ Slash Command Loaded: /${command.name}`);
              this.allCommands.push(Slash.toJSON());
            }
          }
        } catch (e) {
          this.logger.error(e as Error);
        }
        
        return true;
    }      
    public async loadContextMenu(path = "/commands/context") {
        try {
          const basePath = `${process.cwd()}${path}`;
          const dirs = await promises.readdir(basePath);
          const commands = await Promise.all(dirs.map(dir => import(globalFilePath(`${basePath}/${dir}`)).then(x => x.default)));
          
          for (let i = 0; i < dirs.length; i++) {
            const dir = dirs[i];
            const command = commands[i] as ContextCommand;
            
            if (!command.name) {
              this.logger.stringError(`${basePath}/${dir} not containing a Command-Name`);
              continue;
            }
            
            const Slash = new ContextMenuCommandBuilder()
              .setName(command.name)
              .setType(ApplicationCommandType[command.type]);
            
            if (command.localizations) Slash.setNameLocalizations(command.localizations);
            if (command.defaultPermissions) Slash.setDefaultMemberPermissions(command.defaultPermissions);
            if (command.dmPermissions) Slash.setDefaultMemberPermissions(command.dmPermissions);
            
            command.commandId = this?.fetchedApplication?.find?.((c) => c?.name == command.name)?.permissions?.commandId ?? "commandId";
            command.slashCommandKey = `/${command.name}`;
            command.mention = `<${command.slashCommandKey}:${command.commandId}>`;
            command.shortName = dir.split(".ts").join("");
            
            this.commands.set("context_" + command.name, command);
            this.logger.debug(`✅ Context Command Loaded: /${command.name}`);
            this.allCommands.push(Slash.toJSON());
          }
        } catch (e) {
          this.logger.error(e as Error);
        }
        
        return true;
    }      
    public async prepareCommands() {
        const allSlashs = await this.application?.commands.fetch(undefined)
            .then(x => [...x.values()])
            .catch(console.warn) 
            || (this.application?.commands.cache.values() ? [...this.application?.commands.cache.values()] : [])
            || [];
        if(allSlashs?.length) {
            this.fetchedApplication = allSlashs;
            for(const [key, value] of [...this.commands.entries()]) {
                if(!value.slashCommandKey) continue;
                const Base = value.slashCommandKey.split(" ")[0].replace("/", "");
                value.commandId = allSlashs.find(c => c.name === Base)?.permissions?.commandId || "0";
                value.mention = value.mention?.replace("commandId", value.commandId);
                this.commands.set(key, value)
            }
            this.logger.debug(`✅ Set Command Mentions of: ${allSlashs?.length} Commands`);
        }
        return true;
    }
    public async publishCommands(guildIds?: string[], del?: boolean) {
        if (del) {
          for (var guild of this.guilds.cache.values()) {
            guild.commands.set([]).catch(e => {this.logger.error(e);this.logger.debug(`recent error were for guild ${guild.name} || ${guild.id}`);});
          }
          this.logger.debug(`Deleted all commands!`)
        } 
        if(this.cluster.id !== 0) return;
        if(!guildIds) {
            await this.application?.commands.set(this.allCommands).then(() => {
                this.logger.debug(`SLASH-CMDS | Set ${this.commands.size} slashCommands!`)
            }).catch(e => {this.logger.error(e);});
            return true;
        }
        await this.application?.commands.set(this.allCommands.filter((c) => !this.config.devCommands?.includes?.(c.name))).then(() => {
            this.logger.debug(`SLASH-CMDS | Set ${this.commands.size} global slashCommands!`)
        }).catch(e => {this.logger.error(e);});
        for (var guildId of guildIds) {
          const shardId = ShardClientUtil.shardIdForGuildId(guildId, getInfo().TOTAL_SHARDS)
          if(![...this.cluster.ids.keys()].includes(shardId)) return this.logger.warn("CANT UPDATE SLASH COMMANDS - WRONG CLUSTER");
          const guild = this.guilds.cache.get(guildId);
          if(!guild) return this.logger.stringError(`could not find the guild \`${guildId}\` for updating slash commands`)
          guild.commands.set(this.allCommands.filter((c) => this.config.devCommands?.includes?.(c.name))).catch(e => {this.logger.error(e);});
        }
        this.logger.debug(`SLASH-CMDS | Set ${this.commands.size} guild slashCommands!`)
        return true;
    }
    private buildOption(op: any, option: any) {
        op.setName(option.name.toLowerCase())
            .setDescription(option.description || "TEMP_DESC")
            .setRequired(!!option.required);
    
        if (option.localizations?.length) {
            for (const localization of option.localizations) {
                if (!localization.language) continue;
                if (localization.name) op.setNameLocalization(localization.language, localization.name);
                if (localization.description) op.setDescriptionLocalization(localization.language, localization.description);
            }
        }
        return op;
    }
    private buildCommandOptions(command: Command, Slash: SlashCommandSubcommandBuilder|SlashCommandBuilder) {
        if (command.options?.length) {
            for (const option of command.options) {
                const type = option.type.toLowerCase();
                if (type === optionTypes.attachment) {
                    Slash.addAttachmentOption(op => this.buildOption(op, option));
                } else if (type === optionTypes.channel) {
                    Slash.addChannelOption(op => {
                        op = this.buildOption(op, option);
                        if (option.channelTypes) op.addChannelTypes(...option.channelTypes);
                        return op;
                    });
                } else if (type === optionTypes.number || type === optionTypes.numberchoices) {
                    Slash.addNumberOption(op => {
                        op = this.buildOption(op, option);
                        op.setAutocomplete(!!option.autocomplete);
                        if (option.max) op.setMaxValue(option.max);
                        if (option.min) op.setMinValue(option.min);
                        if (type === optionTypes.numberchoices && option.choices) {
                            const numberChoices = option.choices.filter((choice): choice is commandOptionChoiceNumber => typeof choice.value === 'number');
                            op.setChoices(...numberChoices);
                        }
                        return op;
                    });
                } else if (type === optionTypes.role) {
                    Slash.addRoleOption(op => this.buildOption(op, option));
                } else if (type === optionTypes.string || type === optionTypes.stringchoices) {
                    Slash.addStringOption(op => {
                        op = this.buildOption(op, option);
                        op.setAutocomplete(!!option.autocomplete);
                        if (option.max) op.setMaxLength(option.max);
                        if (option.min) op.setMinLength(option.min);
                        if (type === optionTypes.stringchoices && option.choices) {
                            const stringChoices = option.choices.filter((choice): choice is commandOptionChoiceString => typeof choice.value === 'string');
                            op.setChoices(...stringChoices);
                        }
                        return op;
                    });
                } else if (type === optionTypes.user) {
                    Slash.addUserOption(op => this.buildOption(op, option));
                }
            }
        }
        return true;
    }
}    

export function getDefaultClientOptions() {
    return {
        shards: getInfo().SHARD_LIST,
        shardCount: getInfo().TOTAL_SHARDS,

        partials: [
            Partials.Channel,
            Partials.Message,
            Partials.GuildMember,
            Partials.ThreadMember,
            Partials.Reaction,
            Partials.User,
            Partials.GuildScheduledEvent,
        ],
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildModeration,
            GatewayIntentBits.GuildEmojisAndStickers,
            GatewayIntentBits.GuildIntegrations,
            GatewayIntentBits.GuildWebhooks,
            GatewayIntentBits.GuildInvites,
            GatewayIntentBits.GuildVoiceStates,
            //GatewayIntentBits.GuildPresences,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMessageReactions,
            //GatewayIntentBits.GuildMessageTyping,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.DirectMessageReactions,
            //GatewayIntentBits.DirectMessageTyping,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.AutoModerationExecution,
            GatewayIntentBits.AutoModerationConfiguration
        ],
        presence: {
            activities: [
                {
                    name: `Booting up`, type: ActivityType.Playing
                }
            ],
            status: PresenceUpdateStatus.DoNotDisturb as PresenceStatusData
        },
        failIfNotExists: false,
        allowedMentions: {
            parse: [],
            users: [],
            roles: [],
            repliedUser: false,
        }
    };
}

export const globalFilePath = (path: string): string => pathToFileURL(path)?.href || path;
