Az – JS-библиотека для морфологического анализа, токенизации и прочих NLP-задач для русского языка.

Основана на библиотеке [pymorphy2](https://github.com/kmike/pymorphy2) для Python.

Состоит из следующих модулей:
- [**Az.Tokens**](https://github.com/deNULL/Az.js/wiki/Az.Tokens) (az.tokens.js). Токенизация. Умеет корректно разбивать текст (в виде строки) на токены. Понимает разные виды токенов — гиперссылки (в том числе без "http://" или "www." в начале), хэштеги, электронные адреса. Кроме того, умеет разбирать HTML-, вики- и Markdown-разметку.
- [**Az.Morph**](https://github.com/deNULL/Az.js/wiki/Az.Morph) (az.morph.js). Морфология. Определяет части речи и прочие грамматические признаки русских слов, как существующих в словаре, так и отсутствующих в нём, в том числе из-за опечаток. Словари имеют формат, очень близкий к формату словарей [pymorphy2](https://github.com/kmike/pymorphy2), но отличаются в некоторых деталях ради компактности. В данный момент словари доступны как часть библиотеки (в папке `dicts/`), в дальнейшем планируется возможность собирать их самостоятельно (из базы [OpenCorpora](http://opencorpora.org/)).
- **Az.Syntax** (az.syntax.js). Синтаксис. (в планах)

## Установка

Через **npm**:
```
$ npm install az --save
```

```js
var Az = require('az');
```

Через **bower**:
```
$ bower install az --save
```

```html
<script src="bower_components/az/dist/az.min.js"></script>
```

## Полезные ссылки

- [Демо](http://denull.github.io/Az.js/)
- Документация по API библиотеки: [на GitHub](https://github.com/deNULL/Az.js/wiki/) | [на Doclets.io](https://doclets.io/deNULL/Az.js/master)
- [Документация pymorphy2](http://pymorphy2.readthedocs.io/en/latest/user/index.html)
- [Открытый корпус OpenCorpora](http://opencorpora.org/) и [его список граммем](http://opencorpora.org/dict.php?act=gram)

## Токенизация

Пример:
```js
var tokens = Az.Tokens('Мама мыла раму').done();
// => 3 слова, 2 пробельных токена
```

Конструктор `Az.Tokens` принимает на вход строку и разбивает её на токены. Например, каждое слово, последовательность пробелов, пунктуация — считаются отдельными токенами. Никакого дополнительного анализа над токенами не производится.

При этом разбивка производится относительно «умным» способом, который позволяет выделять в отдельные токены ссылки, хэштеги и адреса электронной почты. Кроме «чистого» текста поддерживается HTML-, вики- и Markdown-разметка (никакой особой структуры при этом не строится, но сущности разметки — например, HTML-теги — выделяются в отдельные токены).

Кроме того, токенизатор написан таким образом, чтобы в него можно было подавать текст кусками, и он при этом корректно обрабатывает токены на стыках кусков:
```js
var tokens = Az.Tokens('Длинный те')
  .append('кст, разбиты')
  .append('й на несколько частей')
  .done(); // => 6 слов, 5 пробельных токенов, 1 знак препинания
```
Например, можно читать большой документ, постепенно «скармливая» его токенизатору.

Пробелы (и прочие служебные символы) всегда превращаются в токены наравне с остальным контентом. Это позволяет, например, склеить текст в точности в том виде, в котором он был до токенизации. Однако это может быть не очень удобно при обработке токенов. Для упрощения работы «доставать» токены можно с фильтрацией: то есть игнорировать токены определенных типов (или, наоборот, извлекать токены определенных типов).

В плане публичного API токенизатор вдохновлен классом ```StringTokenizer``` в Java.

Подробная документация: [**Az.Tokens**](https://github.com/deNULL/Az.js/wiki/Az.Tokens).

## Морфология

Пример:
```js
Az.Morph.init(function() {
  var parses = Az.Morph('стали');
  console.log(parses); // => 6 вариантов разбора
});
```

Морфологический анализатор принимает на вход единственное слово (например, полученное после токенизации) и возвращает массив возможных вариантов его разбора: часть речи, падеж, род и т.д. Варианты сортируются по убыванию «правдоподобия», поэтому предполагается, что первый вариант должен быть ближе всего к истине.

Для разбора используются словари в [специальном формате DAWG](http://pymorphy2.readthedocs.io/en/latest/internals/dict.html#id12), поэтому перед работой с морфологическим модулем их следует загрузить: вызвать метод `Az.Morph.init([path], callback)` и дождаться их загрузки (вызова `callback`). По умолчанию они грузятся из подпапки `dicts`, но её можно указать вручную первым параметром.

Как и в [pymorphy2](http://pymorphy2.readthedocs.io/en/latest/internals/prediction.html), в Az для неизвестных слов работают предсказатели (только в pymorphy2 они называются анализаторами, а тут — парсерами). Список применяемых парсеров можно посмотреть в исходниках и при желании переопределить с помощью опции `parsers` в конфиге. Кроме того, можно писать свои парсеры и складывать в объект `Az.Morph.Parsers` – они также будут доступны для анализа.

В дополнение к предсказателям, при словарном разборе можно разрешить исправление опечаток и т.н. «заикания» (это когда в слове преднамеренно растягивают буквы: «го-о-ол», «нееет»). Это, очевидно, несколько ухудшает производительность (особенно это касается именно опечаток), поэтому использоваться должно осознанно. В целом же библиотека писалась с упором на хорошую работу не только в «тепличных условиях» (когда предполагается идеальная корректность текста на входе), но в «дикой природе».

Каждый вариант разбора представляет из себя, грубо говоря, предполагаемую форму слова (т.н. «тег») и описание того, как слово нужно склонять. Просклонять его можно методом `inflect`, привести в начальную форму — методом `normalize`.

Тег — некий набор атрибутов слова (граммем), часть которых являются изменяемыми, часть — неизменяемыми. Некоторые граммемы являются «булевыми» (то есть они либо есть, либо нет) — например, граммема `Arch` означает, что слово является устаревшим. В таком случае наличие такой граммемы проверяется так: `if (parses[0].tag.Arch) ...` (или `if ('Arch' in parses[0].tag) ...`). Другие граммемы объединяют в себя список «дочерних» граммем: например, граммема `CAse` обозначает падеж, и может принимать значения `nomn`, `gent` и т.д. В таком случае поле `parses[0].tag.CAse` содержит строку (допустим, `'gent'`) + присутствует и дочерняя граммема сама по себе: `parses[0].tag.gent == true`. Полный список возможных граммем доступен на [сайте OpenCorpora](http://opencorpora.org/dict.php?act=gram).

Подробная документация: [**Az.Morph**](https://github.com/deNULL/Az.js/wiki/Az.Morph).

## Синтаксис

В дальнейших планах предполагается работа над синтаксическим анализом предложений (построением синтаксических деревьев) и извлечением смыслов.
