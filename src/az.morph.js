;(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? (module.exports = module.exports || {}) && (module.exports.Morph = factory(module.exports)) :
  typeof define === 'function' && define.amd ? define('Az.Morph', ['Az', 'Az.DAWG'], factory) :
  (global.Az = global.Az || {}) && (global.Az.Morph = factory(global.Az))
}(this, function (Az) { 'use strict';
  /** @namespace Az **/
  var words,
      probabilities,
      predictionSuffixes = new Array(3),
      prefixes = [ '', 'по', 'наи' ],
      suffixes,
      grammemes,
      paradigms,
      tags,
      defaults = {
        ignoreCase: false,
        replacements: { 'е': 'ё' },
        stutter: Infinity,
        typos: 0,
        parsers: [
          // Словарные слова + инициалы
          'Dictionary?', 'AbbrName?', 'AbbrPatronymic',
          // Числа, пунктуация, латиница (по-хорошему, токенизатор не должен эту ерунду сюда пускать)
          'IntNumber', 'RealNumber', 'Punctuation', 'RomanNumber?', 'Latin',
          // Слова с дефисами
          'HyphenParticle', 'HyphenAdverb', 'HyphenWords',
          // Предсказатели по префиксам/суффиксам
          'PrefixKnown', 'PrefixUnknown?', 'SuffixKnown'
        ],
        forceParse: false,
        normalizeScore: true
      },
      initials = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ',
      particles = ['-то', '-ка', '-таки', '-де', '-тко', '-тка', '-с', '-ста'],
      knownPrefixes = [
        'авиа', 'авто', 'аква', 'анти', 'анти-', 'антропо', 'архи', 'арт', 'арт-', 'астро', 'аудио', 'аэро',
        'без', 'бес', 'био', 'вело', 'взаимо', 'вне', 'внутри', 'видео', 'вице-', 'вперед', 'впереди',
        'гекто', 'гелио', 'гео', 'гетеро', 'гига', 'гигро', 'гипер', 'гипо', 'гомо',
        'дву', 'двух', 'де', 'дез', 'дека', 'деци', 'дис', 'до', 'евро', 'за', 'зоо', 'интер', 'инфра',
        'квази', 'квази-', 'кило', 'кино', 'контр', 'контр-', 'космо', 'космо-', 'крипто', 'лейб-', 'лже', 'лже-',
        'макро', 'макси', 'макси-', 'мало', 'меж', 'медиа', 'медиа-', 'мега', 'мета', 'мета-', 'метео', 'метро', 'микро',
        'милли', 'мини', 'мини-', 'моно', 'мото', 'много', 'мульти',
        'нано', 'нарко', 'не', 'небез', 'недо', 'нейро', 'нео', 'низко', 'обер-', 'обще', 'одно', 'около', 'орто',
        'палео', 'пан', 'пара', 'пента', 'пере', 'пиро', 'поли', 'полу', 'после', 'пост', 'пост-',
        'порно', 'пра', 'пра-', 'пред', 'пресс-', 'противо', 'противо-', 'прото', 'псевдо', 'псевдо-',
        'радио', 'разно', 'ре', 'ретро', 'ретро-', 'само', 'санти', 'сверх', 'сверх-', 'спец', 'суб', 'супер', 'супер-', 'супра',
        'теле', 'тетра', 'топ-', 'транс', 'транс-', 'ультра', 'унтер-', 'штаб-',
        'экзо', 'эко', 'эндо', 'эконом-', 'экс', 'экс-', 'экстра', 'экстра-', 'электро', 'энерго', 'этно'
      ],
      UNKN,
      __init = [];

  // Взято из https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
  function deepFreeze(obj) {
    if (!('freeze' in Object)) {
      return;
    }

    var propNames = Object.getOwnPropertyNames(obj);
    propNames.forEach(function(name) {
      var prop = obj[name];

      if (typeof prop == 'object' && prop !== null)
        deepFreeze(prop);
    });

    return Object.freeze(obj);
  }

  /**
   * Тег. Содержит в себе информацию о конкретной форме слова, но при этом
   * к конкретному слову не привязан. Всевозможные значения тегов переиспользуются
   * для всех разборов слов.
   *
   * Все граммемы навешаны на тег как поля. Если какая-то граммема содержит в себе
   * дочерние граммемы, то значением поля является именно название дочерней
   * граммемы (например, tag.GNdr == 'masc'). В то же время для дочерних граммем
   * значением является просто true (т.е. условие можно писать и просто как
   * if (tag.masc) ...).
   *
   * @property {string[]} stat Полный список неизменяемых граммем.
   * @property {string[]} flex Полный список изменяемых граммем.
   * @property {Tag} ext Копия тега с русскими обозначениями (по версии OpenCorpora).
   */
  var Tag = function(str) {
    var par, pair = str.split(' ');
    this.stat = pair[0].split(',');
    this.flex = pair[1] ? pair[1].split(',') : [];
    for (var j = 0; j < 2; j++) {
      var grams = this[['stat', 'flex'][j]];
      for (var i = 0; i < grams.length; i++) {
        var gram = grams[i];
        this[gram] = true;
        // loc2 -> loct -> CAse
        while (grammemes[gram] && (par = grammemes[gram].parent)) {
          this[par] = gram;
          gram = par;
        }
      }
    }
    if ('POST' in this) {
      this.POS = this.POST;
    }
  }

  /**
   * Возвращает текстовое представление тега.
   *
   * @returns {string} Список неизменяемых граммем через запятую, пробел,
   *  и список изменяемых граммем через запятую.
   */
  Tag.prototype.toString = function() {
    return (this.stat.join(',') + ' ' + this.flex.join(',')).trim();
  }

  /**
   * Проверяет согласованность с конкретными значениями граммем либо со списком
   * граммем из другого тега (или слова).
   *
   * @param {Tag|Parse} [tag] Тег или разбор слова, с которым следует
   *  проверить согласованность.
   * @param {Array|Object} grammemes Граммемы, по которым нужно проверить
   *  согласованность.
   *
   *  Если указан тег (или разбор), то grammemes должен быть массивом тех
   *  граммем, которые у обоих тегов должны совпадать. Например:
   *  tag.matches(otherTag, ['POS', 'GNdr'])
   *
   *  Если тег не указан, а указан массив граммем, то проверяется просто их
   *  наличие. Например, аналог выражения (tag.NOUN && tag.masc):
   *  tag.matches([ 'NOUN', 'masc' ])
   *
   *  Если тег не указан, а указан объект, то ключи в нем — названия граммем,
   *  значения — дочерние граммемы, массивы граммем, либо true/false:
   *  tag.matches({ 'POS' : 'NOUN', 'GNdr': ['masc', 'neut'] })
   * @returns {boolean} Является ли текущий тег согласованным с указанным.
   */
  // TODO: научиться понимать, что некоторые граммемы можно считать эквивалентными при сравнении двух тегов (вариации падежей и т.п.)
  Tag.prototype.matches = function(tag, grammemes) {
    if (!grammemes) {
      if (Object.prototype.toString.call(tag) === '[object Array]') {
        for (var i = 0; i < tag.length; i++) {
          if (!this[tag[i]]) {
            return false;
          }
        }
        return true;
      } else
      // Match to map
      for (var k in tag) {
        if (Object.prototype.toString.call(tag[k]) === '[object Array]') {
          if (!tag[k].indexOf(this[k])) {
            return false;
          }
        } else {
          if (tag[k] != this[k]) {
            return false;
          }
        }
      }
      return true;
    }

    if (tag instanceof Parse) {
      tag = tag.tag;
    }

    // Match to another tag
    for (var i = 0; i < grammemes.length; i++) {
      if (tag[grammemes[i]] != this[grammemes[i]]) {
        // Special case: tag.CAse 
        return false;
      }
    }
    return true;
  }

  Tag.prototype.isProductive = function() {
    return !(this.NUMR || this.NPRO || this.PRED || this.PREP || 
      this.CONJ || this.PRCL || this.INTJ || this.Apro || 
      this.NUMB || this.ROMN || this.LATN || this.PNCT ||
      this.UNKN);
  }

  function makeTag(tagInt, tagExt) {
    var tag = new Tag(tagInt);
    tag.ext = new Tag(tagExt);
    return deepFreeze(tag);
  }

  /**
   * Производит морфологический анализ слова. Возвращает возможные варианты
   * разбора по убыванию их правдоподобности.
   *
   * @playground
   * var Az = require('az');
   * Az.Morph.init(function() {
   *   console.log(Az.Morph('стали'));
   * });
   * @param {string} word Слово, которое следует разобрать.
   * @param {Object} [config] Опции разбора.
   * @param {boolean} [config.ignoreCase=False] Следует ли игнорировать
   *  регистр слов (в основном это означает возможность написания имен собственных и
   *  инициалов с маленькой буквы).
   * @param {Object} [config.replacements={ 'е': 'ё' }] Допустимые замены букв
   *  при поиске слов в словаре. Ключи объекта — заменяемые буквы в разбираемом
   *  слове, соответствующие им значения — буквы в словарных словах, которым
   *  допустимо встречаться вместо заменяемых. По умолчанию буква «е» может
   *  соответствовать букве «ё» в словарных словах.
   * @param {number} [config.stutter=Infinity] «Заикание». Устраняет повторения букв
   *  (как с дефисом - «не-е-ет», так и без - «нееет»).
   *
   *  Infinity не ограничивает максимальное число повторений (суммарно во всем слове).
   *
   *  0 или false чтобы отключить.
   * @param {number|'auto'} [config.typos=0] Опечатки. Максимальное количество
   * опечаток в слове.
   *
   *  Опечаткой считается:
   *   - лишняя буква в слове
   *   - (пропущенная буква в слове) (TODO: пока не работает)
   *   - не та буква в слове (если правильная буква стоит рядом на клавиатуре)
   *   - переставленные местами соседние буквы
   *
   *  0 или false чтобы отключить.
   *
   *  'auto':
   *  - 0, если слово короче 5 букв
   *  - 1, если слово короче 10 букв (но только если не нашлось варианта разбора без опечаток)
   *  - 2 в противном случае (но только если не нашлось варианта разбора без опечаток или с 1 опечаткой)
   * @param {string[]} [config.parsers] Список применяемых парсеров (см. поля
   *  объекта Az.Morph.Parsers) в порядке применения (т.е. стоящие в начале
   *  имеют наивысший приоритет).
   *
   *  Вопросительный знак означает, что данный парсер не терминальный, то есть
   *  варианты собираются до первого терминального парсера. Иными словами, если
   *  мы дошли до какого-то парсера, значит все стоящие перед ним терминальные
   *  парсеры либо не дали результата совсем, либо дали только с опечатками.
   *
   *  (парсер в терминологии pymorphy2 — анализатор)
   * @param {boolean} [config.forceParse=False] Всегда возвращать хотя бы один вариант
   *  разбора (как это делает pymorphy2), даже если совсем ничего не получилось.
   * @returns {Parse[]} Варианты разбора.
   * @memberof Az
   */
  var Morph = function(word, config) {
    config = config ? Az.extend(defaults, config) : defaults;

    var parses = [];
    var matched = false;
    for (var i = 0; i < config.parsers.length; i++) {
      var name = config.parsers[i];
      var terminal = name[name.length - 1] != '?';
      name = terminal ? name : name.slice(0, -1);
      if (name in Morph.Parsers) {
        var vars = Morph.Parsers[name](word, config);
        for (var j = 0; j < vars.length; j++) {
          if (!vars[j].stutterCnt && !vars[j].typosCnt) {
            matched = true;
          }
        }

        parses = parses.concat(vars);
        if (matched && terminal) {
          break;
        }
      } else {
        console.warn('Parser "' + name + '" is not found. Skipping');
      }
    }

    if (!parses.length && config.forceParse) {
      parses.push(new Parse(word.toLocaleLowerCase(), UNKN));
    }

    var total = 0;
    var probs = [];
    var useProbs = false;
    for (var i = 0; i < parses.length; i++) {
      var res = probabilities.findAll(parses[i] + ':' + parses[i].tag);
      if (res && res[0]) {
        probs.push((res[0][1] / 1000000) * getDictionaryScore(parses[i].stutterCnt, parses[i].typosCnt));
        useProbs = true;
      } else {
        probs.push(0);
      }
      total += parses[i].score;
    }

    if (useProbs) {
      for (var i = 0; i < parses.length; i++) {
        parses[i].score = probs[i];
      }
    } else
    if (total > 0 && config.normalizeScore) {
      for (var i = 0; i < parses.length; i++) {
        parses[i].score /= total;
      }
    }

    parses.sort(function(e1, e2) {
      return e2.score - e1.score;
    });

    return parses;
  }

  // TODO: вынести парсеры в отдельный файл(ы)?

  Morph.Parsers = {}

  /**
   * Один из возможных вариантов морфологического разбора.
   *
   * @property {string} word Слово в текущей форме (с исправленными ошибками,
   *  если они были)
   * @property {Tag} tag Тег, описывающий текущую форму слова.
   * @property {number} score Число от 0 до 1, соответствующее «уверенности»
   *  в данном разборе (чем оно выше, тем вероятнее данный вариант).
   * @property {number} stutterCnt Число «заиканий», исправленных в слове.
   * @property {number} typosCnt Число опечаток, исправленных в слове.
   */
  var Parse = function(word, tag, score, stutterCnt, typosCnt) {
    this.word = word;
    this.tag = tag;
    this.stutterCnt = stutterCnt || 0;
    this.typosCnt = typosCnt || 0;
    this.score = score || 0;
  }

  /**
   * Приводит слово к его начальной форме.
   *
   * @param {boolean} keepPOS Не менять часть речи при нормализации (например,
   *  не делать из причастия инфинитив).
   * @returns {Parse} Разбор, соответствующий начальной форме или False,
   *  если произвести нормализацию не удалось.
   */
  // TODO: некоторые смены частей речи, возможно, стоит делать в любом случае (т.к., например, компаративы, краткие формы причастий и прилагательных разделены, инфинитив отделен от глагола)
  Parse.prototype.normalize = function(keepPOS) {
    return this.inflect(keepPOS ? { POS: this.tag.POS } : 0);
  }

  /**
   * Приводит слово к указанной форме.
   *
   * @param {Tag|Parse} [tag] Тег или другой разбор слова, с которым следует
   *  согласовать данный.
   * @param {Array|Object} grammemes Граммемы, по которым нужно согласовать слово.
   * @returns {Parse|False} Разбор, соответствующий указанной форме или False,
   *  если произвести согласование не удалось.
   * @see Tag.matches
   */
  Parse.prototype.inflect = function(tag, grammemes) {
    return this;
  }

  /**
   * Проверяет, согласуется ли текущая форма слова с указанной.
   *
   * @param {Tag|Parse} [tag] Тег или другой разбор слова, с которым следует
   *  проверить согласованность.
   * @param {Array|Object} grammemes Граммемы, по которым нужно проверить
   *  согласованность.
   * @returns {boolean} Является ли текущая форма слова согласованной с указанной.
   * @see Tag.matches
   */
  Parse.prototype.matches = function(tag, grammemes) {
    return this.tag.matches(tag, grammemes);
  }

  /**
   * Возвращает текущую форму слова.
   *
   * @returns {String} Текущая форма слова.
   */
  Parse.prototype.toString = function() {
    return this.word;
  }

  // Выводит информацию о слове в консоль.
  Parse.prototype.log = function() {
    console.group(this.toString());
    console.log('Stutter?', this.stutterCnt, 'Typos?', this.typosCnt);
    console.log(this.tag.ext.toString());
    console.groupEnd();
  }

  function lookupWord(word, config) {
    var entries;
    if (config.typos == 'auto') {
      entries = words.findAll(word, config.replacements, config.stutter, 0);
      if (!entries.length && word.length > 4) {
        entries = words.findAll(word, config.replacements, config.stutter, 1);
        if (!entries.length && word.length > 9) {
          entries = words.findAll(word, config.replacements, config.stutter, 2);
        }
      }
    } else {
      entries = words.findAll(word, config.replacements, config.stutter, config.typos);
    }
    return entries;
  }

  function getDictionaryScore(stutterCnt, typosCnt) {
    // = 1.0 if no stutter/typos
    // = 0.25 if any number of stutter or 1 typo
    // = 0.125 if 2 typos
    // = 0.031 if 3 typos
    return Math.pow(0.25, Math.min(stutterCnt, 1) + typosCnt);
  }

  var DictionaryParse = function(word, paradigmIdx, formIdx, stutterCnt, typosCnt, prefix, suffix) {
    this.word = word;
    this.paradigmIdx = paradigmIdx;
    this.paradigm = paradigms[paradigmIdx];
    this.formIdx = formIdx;
    this.formCnt = this.paradigm.length / 3;
    this.tag = tags[this.paradigm[this.formCnt + formIdx]];
    this.stutterCnt = stutterCnt || 0;
    this.typosCnt = typosCnt || 0;
    this.score = getDictionaryScore(stutterCnt, typosCnt);
    this.prefix = prefix || '';
    this.suffix = suffix || '';
  }

  DictionaryParse.prototype = Object.create(Parse.prototype);
  DictionaryParse.prototype.constructor = DictionaryParse;

  // Возвращает основу слова
  DictionaryParse.prototype.base = function() {
    if (this._base) {
      return this._base;
    }
    return (this._base = this.word.substring(
      prefixes[this.paradigm[(this.formCnt << 1) + this.formIdx]].length,
      this.word.length - suffixes[this.paradigm[this.formIdx]].length)
    );
  }

  // Склоняет/спрягает слово так, чтобы оно соответствовало граммемам другого слова, тега или просто конкретным граммемам (подробнее см. Tag.prototype.matches).
  // Всегда выбирается первый подходящий вариант.
  DictionaryParse.prototype.inflect = function(tag, grammemes) {
    if (!grammemes && typeof tag === 'number') {
      // Inflect to specific formIdx
      return new DictionaryParse(
          prefixes[this.paradigm[(this.formCnt << 1) + tag]] +
          this.base() +
          suffixes[this.paradigm[tag]],
        this.paradigmIdx,
        tag, 0, 0, this.prefix, this.suffix
      );
    }

    for (var formIdx = 0; formIdx < this.formCnt; formIdx++) {
      if (tags[this.paradigm[this.formCnt + formIdx]].matches(tag, grammemes)) {
        return new DictionaryParse(
            prefixes[this.paradigm[(this.formCnt << 1) + formIdx]] +
            this.base() +
            suffixes[this.paradigm[formIdx]],
          this.paradigmIdx,
          formIdx, 0, 0, this.prefix, this.suffix
        );
      }
    }

    return false;
  }

  DictionaryParse.prototype.log = function() {
    console.group(this.toString());
    console.log('Stutter?', this.stutterCnt, 'Typos?', this.typosCnt);
    console.log(prefixes[this.paradigm[(this.formCnt << 1) + this.formIdx]] + '|' + this.base() + '|' + suffixes[this.paradigm[this.formIdx]]);
    console.log(this.tag.ext.toString());
    var norm = this.normalize();
    console.log('=> ', norm[0] + ' (' + norm[1].ext.toString() + ')');
    var norm = this.normalize(true);
    console.log('=> ', norm[0] + ' (' + norm[1].ext.toString() + ')');
    console.groupCollapsed('Все формы: ' + len);
    for (var formIdx = 0; formIdx < this.formCnt; formIdx++) {
      var form = this.inflect(formIdx);
      console.log(form[0] + ' (' + form[1].ext.toString() + ')');
    }
    console.groupEnd();
    console.groupEnd();
  }

  DictionaryParse.prototype.toString = function() {
    if (this.prefix) {
      var pref = prefixes[this.paradigm[(this.formCnt << 1) + this.formIdx]];
      return pref + this.prefix + this.word.substr(pref.length) + this.suffix;
    } else {
      return this.word + this.suffix;
    }
  }

  var CombinedParse = function(left, right) {
    this.left = left;
    this.right = right;
    this.tag = right.tag;
    this.score = left.score * right.score * 0.8;
    this.stutterCnt = left.stutterCnt + right.stutterCnt;
    this.typosCnt = left.typosCnt + right.typosCnt;
    if ('formCnt' in right) {
      this.formCnt = right.formCnt;
    }
  }

  CombinedParse.prototype = Object.create(Parse.prototype);
  CombinedParse.prototype.constructor = CombinedParse;

  CombinedParse.prototype.inflect = function(tag, grammemes) {
    var left, right;

    var right = this.right.inflect(tag, grammemes);
    if (!grammemes && typeof tag === 'number') {
      left = this.left.inflect(right.tag, ['POST', 'NMbr', 'CAse', 'PErs', 'TEns']);
    } else {
      left = this.left.inflect(tag, grammemes);
    }
    if (left && right) {
      return new CombinedParse(left, right);
    } else {
      console.log('Impossible to inflect both:');
      console.log(tag, grammemes);
      console.log(right, right.tag);
      return false;
    }
  }

  CombinedParse.prototype.toString = function() {
    return this.left.word + '-' + this.right.word;
  }

  __init.push(function() {
    Morph.Parsers.Dictionary = function(word, config) {
      word = word.toLocaleLowerCase();

      var opts = lookupWord(word, config);

      var vars = [];
      for (var i = 0; i < opts.length; i++) {
        for (var j = 0; j < opts[i][1].length; j++) {
          var w = new DictionaryParse(
            opts[i][0],
            opts[i][1][j][0],
            opts[i][1][j][1],
            opts[i][2],
            opts[i][3]);
          vars.push(w);
        }
      }
      return vars;
    }

    var InitialsParser = function(isPatronymic, score) {
      var initialsTags = [];
      for (var i = 0; i < 1; i++) {
        for (var j = 0; j < 6; j++) {
          initialsTags.push(makeTag(
            'NOUN,anim,' + ['masc', 'femn'][i] + ',Sgtm,Name,Fixd,Abbr,Init sing,' + ['nomn', 'gent', 'datv', 'accs', 'ablt', 'loct'][j],
            'СУЩ,од,' + ['мр', 'жр'][i] + ',sg,имя,0,аббр,иниц ед,' + ['им', 'рд', 'дт', 'вн', 'тв', 'пр'][j]
          ));
        }
      }
      return function(word, config) {
        if (word.length != 1) {
          return [];
        }
        if (config.ignoreCase) {
          word = word.toLocaleUpperCase();
        }
        if (initials.indexOf(word) == -1) {
          return [];
        }
        var vars = [];
        for (var i = 0; i < initialsTags.length; i++) {
          var w = new Parse(word, initialsTags[i], score);
          vars.push(w);
        }
        return vars;
      }
    }

    Morph.Parsers.AbbrName = InitialsParser(false, 0.1);
    Morph.Parsers.AbbrPatronymic = InitialsParser(true, 0.1);

    var RegexpParser = function(regexp, tag, score) {
      return function(word, config) {
        if (config.ignoreCase) {
          word = word.toLocaleUpperCase();
        }
        if (word.length && word.match(regexp)) {
          return [new Parse(word, tag)];
        } else {
          return [];
        }
      }
    }

    grammemes['NUMB'] = grammemes['ЧИСЛО'] =
    grammemes['ROMN'] = grammemes['РИМ'] =
    grammemes['LATN'] = grammemes['ЛАТ'] =
    grammemes['PNCT'] = grammemes['ЗПР'] =
    grammemes['UNKN'] = grammemes['НЕИЗВ'] =
     { parent: 'POST' };

    Morph.Parsers.IntNumber = RegexpParser(
      /^[−-]?[0-9]+$/,
      makeTag('NUMB,intg', 'ЧИСЛО,цел'), 0.9);

    Morph.Parsers.RealNumber = RegexpParser(
      /^[−-]?([0-9]*[.,][0-9]+)$/,
      makeTag('NUMB,real', 'ЧИСЛО,вещ'), 0.9);

    Morph.Parsers.Punctuation = RegexpParser(
      /^[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-.\/:;<=>?@\[\]^_`{|}~]+$/,
      makeTag('PNCT', 'ЗПР'), 0.9);

    Morph.Parsers.RomanNumber = RegexpParser(
      /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/,
      makeTag('ROMN', 'РИМ'), 0.9);

    Morph.Parsers.Latin = RegexpParser(
      /[A-Za-z\u00C0-\u00D6\u00D8-\u00f6\u00f8-\u024f]/,
      makeTag('LATN', 'ЛАТ'), 0.9);

    // слово + частица
    // смотри-ка
    Morph.Parsers.HyphenParticle = function(word, config) {
      word = word.toLocaleLowerCase();

      var vars = [];
      for (var k = 0; k < particles.length; k++) {
        if (word.substr(word.length - particles[k].length) == particles[k]) {
          var base = word.slice(0, -particles[k].length);
          var opts = lookupWord(base, config);

          //console.log(opts);
          for (var i = 0; i < opts.length; i++) {
            for (var j = 0; j < opts[i][1].length; j++) {
              var w = new DictionaryParse(
                opts[i][0],
                opts[i][1][j][0],
                opts[i][1][j][1],
                opts[i][2],
                opts[i][3],
                '', particles[k]);
              w.score *= 0.9;
              vars.push(w);
            }
          }
        }
      }

      return vars;
    }

    var ADVB = makeTag('ADVB', 'Н');

    // 'по-' + прилагательное в дательном падеже
    // по-западному
    Morph.Parsers.HyphenAdverb = function(word, config) {
      word = word.toLocaleLowerCase();

      if ((word.length < 5) || (word.substr(0, 3) != 'по-')) {
        return [];
      }

      var opts = lookupWord(word.substr(3), config);

      var parses = [];
      var used = {};

      for (var i = 0; i < opts.length; i++) {
        if (!used[opts[i][0]]) {
          for (var j = 0; j < opts[i][1].length; j++) {
            var parse = new DictionaryParse(opts[i][0], opts[i][1][j][0], opts[i][1][j][1], opts[i][2], opts[i][3]);
            if (parse.matches(['ADJF', 'sing', 'datv'])) {
              used[opts[i][0]] = true;

              parse = new Parse(word, ADVB, w.score * 0.7, opts[i][2], opts[i][3]);
              parses.push(parse);
              break;
            }
          }
        }
      }
      return parses;
    }

    // слово + '-' + слово
    // интернет-магазин
    // компания-производитель
    Morph.Parsers.HyphenWords = function(word, config) {
      var word = word.toLocaleLowerCase();
      for (var i = 0; i < knownPrefixes.length; i++) {
        if (word.substr(0, knownPrefixes[i].length) == knownPrefixes[i]) {
          return [];
        }
      }
      var parses = [];
      var parts = word.split('-');
      if (parts.length != 2 || !parts[0].length || !parts[1].length) {
        if (parts.length > 2) {
          var end = parts[parts.length - 1];
          var right = Morph(end, Az.extend(config, { forceParse: false }));
          for (var j = 0; j < right.length; j++) {
            if (right[j] instanceof DictionaryParse) {
              right[j].score *= 0.2;
              right[j].prefix = word.substr(0, word.length - end.length - 1) + '-';
              parses.push(right[j]);
            }
          }
        }
        return parses;
      }
      var left = Morph(parts[0], Az.extend(config, { forceParse: false, normalizeScore: false }));
      var right = Morph(parts[1], Az.extend(config, { forceParse: false, normalizeScore: false }));


      // Variable
      for (var i = 0; i < left.length; i++) {
        if (left[i].tag.Abbr) {
          continue;
        }
        for (var j = 0; j < right.length; j++) {
          if (!left[i].matches(right[j], ['POST', 'NMbr', 'CAse', 'PErs', 'TEns'])) {
            continue;
          }
          if (left[i].stutterCnt + right[j].stutterCnt > config.stutter ||
              left[i].typosCnt + right[j].typosCnt > config.typos) {
            continue;
          }
          parses.push(new CombinedParse(left[i], right[j]));
        }
      }
      // Fixed
      for (var j = 0; j < right.length; j++) {
        if (right[j] instanceof DictionaryParse) {
          right[j].score *= 0.3;
          right[j].prefix = parts[0] + '-';
          parses.push(right[j]);
        }
      }
      
      return parses;
    }


    Morph.Parsers.PrefixKnown = function(word, config) {
      var word = word.toLocaleLowerCase();
      var parses = [];
      for (var i = 0; i < knownPrefixes.length; i++) {
        if (word.length - knownPrefixes[i].length < 3) {
          continue;
        }

        if (word.substr(0, knownPrefixes[i].length) == knownPrefixes[i]) {
          var end = word.substr(knownPrefixes[i].length);
          var right = Morph(end, Az.extend(config, { forceParse: false, normalizeScore: false }));
          for (var j = 0; j < right.length; j++) {
            if (!right[j].tag.isProductive()) {
              continue;
            }
            right[j].score *= 0.75;
            right[j].prefix = knownPrefixes[i];
            parses.push(right[j]);
          }
        }
      }
      return parses;
    }

    Morph.Parsers.PrefixUnknown = function(word, config) {
      // TODO
      return [];
    }

    Morph.Parsers.SuffixKnown = function(word, config) {
      // TODO
      return [];
    }

    UNKN = makeTag('UNKN', 'НЕИЗВ');
  });

  /**
   * Задает опции морфологического анализатора по умолчанию.
   *
   * @param {Object} config Опции анализатора.
   * @see Morph
   */
  Morph.setDefaults = function(config) {
    defaults = config;
  }

  /**
   * Инициализирует анализатор, загружая необходимые для работы словари из
   * указанной директории. Эту функцию необходимо вызвать (и дождаться
   * срабатывания коллбэка) до любых действий с модулем.
   *
   * @param {string} [path] Директория, содержащая файлы 'words.dawg',
   * 'grammemes.json' и т.д. По умолчанию директория 'dicts' в данном модуле.
   * @param {Function} callback Коллбэк, вызываемый после завершения загрузки
   *  всех словарей.
   */
  Morph.init = function(path, callback) {
    var loading = 0;
    var tagsInt, tagsExt;
    function loaded() {
      if (!--loading) {
        tags = Array(tagsInt.length);
        for (var i = 0; i < tagsInt.length; i++) {
          tags[i] = new Tag(tagsInt[i]);
          tags[i].ext = new Tag(tagsExt[i]);
        }
        tags = deepFreeze(tags);
        for (var i = 0; i < __init.length; i++) {
          __init[i]();
        }
        callback && callback(null, Morph);
      }
    }

    if (!callback && typeof path == 'function') {
      callback = path;
      if (typeof __dirname == 'string') {
        path = __dirname + '/../dicts';
      } else {
        path = 'dicts';
      }
    }

    loading++;
    Az.DAWG.load(path + '/words.dawg', 'words', function(err, dawg) {
      words = dawg;
      loaded();
    });

    for (var prefix = 0; prefix < 3; prefix++) {
      (function(prefix) {
        loading++;
        Az.DAWG.load(path + '/prediction-suffixes-' + prefix + '.dawg', 'probs', function(err, dawg) {
          predictionSuffixes[prefix] = dawg;
          loaded();
        });
      })(prefix);
    }

    loading++;
    Az.DAWG.load(path + '/p_t_given_w.intdawg', 'int', function(err, dawg) {
      probabilities = dawg;
      loaded();
    });

    loading++;
    Az.load(path + '/grammemes.json', 'json', function(err, json) {
      grammemes = {};
      for (var i = 0; i < json.length; i++) {
        grammemes[json[i][0]] = grammemes[json[i][2]] = {
          parent: json[i][1],
          internal: json[i][0],
          external: json[i][2],
          externalFull: json[i][3]
        }
      }
      loaded();
    });

    loading++;
    Az.load(path + '/gramtab-opencorpora-int.json', 'json', function(err, json) {
      tagsInt = json;
      loaded();
    });

    loading++;
    Az.load(path + '/gramtab-opencorpora-ext.json', 'json', function(err, json) {
      tagsExt = json;
      loaded();
    });

    loading++;
    Az.load(path + '/suffixes.json', 'json', function(err, json) {
      suffixes = json;
      loaded();
    });

    loading++;
    Az.load(path + '/paradigms.array', 'arraybuffer', function(err, data) {
      var list = new Uint16Array(data),
          count = list[0],
          pos = 1;

      paradigms = [];
      for (var i = 0; i < count; i++) {
        var size = list[pos++];
        paradigms.push(list.subarray(pos, pos + size));
        pos += size;
      }
      loaded();
    });
  }

  return Morph;
}));
