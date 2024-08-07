import { LocaleString } from 'discord.js';
import { promises } from 'fs';
import { readdir } from 'fs/promises';

import { Config, config } from '../config/config.js';
import { Emojis, emojis } from '../config/emoji.js';
import { commandLocalizations } from '../utils/otherTypes.js';
import { Logger } from './Logger.js';

export class ErryLanguage {
  public config: Config
  public emoji: Emojis
  public logger: Logger
  constructor() {
      this.config = config
      this.emoji = emojis
      this.logger = new Logger({prefix: "Erry Language", ...this.config.logLevel})
  }
  public translate(key: string, language: LocaleString, additional?: {[key: string]: string}, replace?: boolean): string {
    try{
      var str
      try {
        str = this.get[language] as NestedLanguageType
        for (var keyy of key.split(".")) {
          str = str[keyy] as NestedLanguageType
        }
      }catch (e) {
        str = this.get[this.config.defaultLanguage] as NestedLanguageType
        for (var keyy of key.split(".")) {
          str = str[keyy] as NestedLanguageType
        }
      }
      if (typeof str == "object") {
        var keys = Object.keys(str)
        for (const key of keys){
          if (typeof str[key] != "string") continue;
          if (additional) {
            for (var placeholder in additional) {
                str[key] = (str[key] as string).replaceAll(`{{${placeholder}}}`, !!!replace ? additional[placeholder] : "")
              }
          }
          for (var placeholder in this.emoji) {
            str[key] = (str[key] as string).replaceAll(`{{Emoji_${placeholder}}}`, !!!replace ? this.emoji[placeholder] : "")
          }
          str[key] = (str[key] as string).replaceAll(/\s*\{{.*?\}}\s*/g, "")
        }
      }else{
        if (additional) {
            for (var placeholder in additional) {
                str = (str as string).replaceAll(`{{${placeholder}}}`, !!!replace ? additional[placeholder] : "")
            }
        }
        for (var placeholder in this.emoji) {
            str = (str as string).replaceAll(`{{Emoji_${placeholder}}}`, !!!replace ? this.emoji[placeholder] : "")
        }
        str = (str as string).replaceAll(/\s*\{{.*?\}}\s*/g, "")
      }
      return (str ? str : "") as string
    }catch(e) {
      console.error(e)
      this.logger.stringError(`Error in key "${key}", language: "${language}"`)
      return ""
    }
  };
  public get get() {
    return languages
  }
  public async init(path = "/languages/") {
    const dirs = await readdir(`${process.cwd()}${path}`)
    for(const dir of dirs) {
      const curPath = `${process.cwd()}${path}/${dir}`;
      const language = JSON.parse((await promises.readFile(curPath)).toString());
      languages[dir.split(".json")[0]] = language
      this.logger.debug(`✅ Language Loaded: ${dir.split(".json")[0]}`)
    }
  }
  public translatePermissions(permissionsArray: string[], ls: LocaleString) {
    if (!permissionsArray || permissionsArray.length <= 0) return this.translate("common.error", ls);
    var result = permissionsArray.map((permission, index) => {
      return this.translate(`common.permissions.${permission}`, ls)
    })
    return result;
  }
}

export const languages: NestedLanguageType = {}


export function getSlashCommandName(path: string): string {
  const keys = path.split('.');
  let current: NestedLanguageType | string = (languages[config.defaultLanguage] as NestedLanguageType)?.commands;

  if (typeof current === 'undefined') {
    throw `You provided wrong default language in config ${config.defaultLanguage}`
  }

  for (const key of keys) {
    if (typeof current === 'string' || !(key in current)) {
      throw `You provided wrong command localizations path (${path}), or this path is not found in default language in config (${config.defaultLanguage})`
    }
    current = current[key];
  }

  if (!(current as NestedLanguageType).slashLocalizations || !((current as NestedLanguageType).slashLocalizations as LanguageCommandLocalizations)?.name)
    throw `No name found in path (${path}), or this path is not found in default language in config ${config.defaultLanguage}`

  return ((current as NestedLanguageType).slashLocalizations as LanguageCommandLocalizations)?.name ?? "undefined";
}

export function getSlashCommandDescription(path: string): string {
  const keys = path.split('.');
  let current: NestedLanguageType | string = (languages[config.defaultLanguage] as NestedLanguageType)?.commands;

  if (typeof current === 'undefined') {
    throw `You provided wrong default language in config ${config.defaultLanguage}`
  }

  for (const key of keys) {
    if (typeof current === 'string' || !(key in current)) {
      throw `You provided wrong command localizations path (${path}), or this path is not found in default language in config (${config.defaultLanguage})`
    }
    current = current[key];
  }

  if (!(current as NestedLanguageType).slashLocalizations || !((current as NestedLanguageType).slashLocalizations as LanguageCommandLocalizations)?.name)
    throw `No name found in path (${path}), or this path is not found in default language in config ${config.defaultLanguage}`

  return ((current as NestedLanguageType).slashLocalizations as LanguageCommandLocalizations)?.description ?? "Description not provided";
}

export function getSlashCommandLocalizations(path: string): commandLocalizations[] {
  const keys = path.split('.');
  let results: commandLocalizations[] = [];

  for (const language of Object.keys(languages)) {
    let current: NestedLanguageType | string = (languages[language] as NestedLanguageType)?.commands;

    if (typeof current === 'undefined') {
      results.push({
        language: language as LocaleString, 
        name: "undefined", 
        description: "undefined"
      });
      continue;
    }

    for (const key of keys) {
      if (typeof current === 'string' || !(key in current)) {
        current = "undefined";
        break;
      }
      current = current[key];
    }

    if (current) {
      results.push({
        language: language as LocaleString, 
        name: ((current as NestedLanguageType).slashLocalizations as LanguageCommandLocalizations)?.name ?? "undefined",
        description: ((current as NestedLanguageType).slashLocalizations as LanguageCommandLocalizations)?.description ?? "No Description Provided"
      });
    } else {
      results.push({language: language as LocaleString, name: "undefined", description: "undefined"});
    }
  }

  return results;
}

export function getSlashCommandOptionName(path: string, number: number): string {
  const keys = path.split('.');
  let current: NestedLanguageType | string = (languages[config.defaultLanguage] as NestedLanguageType)?.commands;

  if (typeof current === 'undefined') {
    throw `You provided wrong default language in config ${config.defaultLanguage}`
  }

  for (const key of keys) {
    if (typeof current === 'string' || !(key in current)) {
      throw `You provided wrong command localizations path (${path}), or this path is not found in default language in config (${config.defaultLanguage})`
    }
    current = current[key];
  }

  if (!(current as NestedLanguageType).slashLocalizations || !(((current as NestedLanguageType).slashLocalizations as LanguageCommandLocalizations)?.options[`${number}`] as LanguageOptionLocalization).name)
    throw `No name found in path (${path}), or this path is not found in default language in config ${config.defaultLanguage}`

  return (((current as NestedLanguageType).slashLocalizations as LanguageCommandLocalizations)?.options[`${number}`] as LanguageOptionLocalization).name ?? "undefined";
}

export function getSlashCommandOptionDescription(path: string, number: number): string {
  const keys = path.split('.');
  let current: NestedLanguageType | string = (languages[config.defaultLanguage] as NestedLanguageType)?.commands;

  if (typeof current === 'undefined') {
    throw `You provided wrong default language in config ${config.defaultLanguage}`
  }

  for (const key of keys) {
    if (typeof current === 'string' || !(key in current)) {
      throw `You provided wrong command localizations path (${path}), or this path is not found in default language in config (${config.defaultLanguage})`
    }
    current = current[key];
  }

  if (!(current as NestedLanguageType).slashLocalizations || !(((current as NestedLanguageType).slashLocalizations as LanguageCommandLocalizations)?.options[`${number}`] as LanguageOptionLocalization).name)
    throw `No description found in path (${path}), or this path is not found in default language in config ${config.defaultLanguage}`

  return (((current as NestedLanguageType).slashLocalizations as LanguageCommandLocalizations)?.options[`${number}`] as LanguageOptionLocalization).description ?? "undefined";
}

export function getSlashCommandOptionLocalizations(path: string, number: number): commandLocalizations[] {
  const keys = path.split('.');
  let results: commandLocalizations[] = [];

  for (const language of Object.keys(languages)) {
    let current: NestedLanguageType | string = (languages[language] as NestedLanguageType)?.commands;

    if (typeof current === 'undefined') {
      results.push({
        language: language as LocaleString, 
        name: "undefined", 
        description: "undefined"
      });
      continue;
    }

    for (const key of keys) {
      if (typeof current === 'string' || !(key in current)) {
        current = "undefined";
        break;
      }
      current = current[key];
    }

    const option = ((current as NestedLanguageType).slashLocalizations as LanguageCommandLocalizations)?.options?.[`${number}`] as undefined|LanguageOptionLocalization

    if (current) {
      results.push({
        language: language as LocaleString, 
        name: option?.name || `undefined-${Math.random().toFixed(4).split(".").join("")}-${language.toLowerCase()}`,
        description: option?.description || "No Description Provided"
      });
    } else {
      results.push({language: language as LocaleString, name: `undefined-${language}`, description: "undefined"});
    }
  }

  return results;
}

export type NestedLanguageType = {
  [key: string]: string | NestedLanguageType;
};

type LanguageCommandLocalizations = {
  name: string;
  description: string;
  options: LanguageOptionsLocalizations
  [key: string]: string | NestedLanguageType;
}
type LanguageOptionsLocalizations = {
  [key: string]: string | LanguageOptionLocalization;
}
type LanguageOptionLocalization = {
  name: string
  description: string
  [key: string]: string | NestedLanguageType;
}