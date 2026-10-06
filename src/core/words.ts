/** High-frequency words (EN + DE). Used for the frequency effect and to skip trivial quiz targets. */
const COMMON = new Set(
  (
    'the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is was are were been has had did said made very much more many such own same each those where why while through still should may might must here off again never always often both few long great little old right big high small large next early young important public bad different able last late hard major better best real sure free full open short whole clear true whole however without within between under during before around against among upon being thing things man men woman women child world life hand part place case week company system program question government number night point home water room mother area money story fact month lot study book eye job word business issue side kind head house service friend father power hour game line end member law car city community name president team minute idea kid body information school face others level office door health person art war history party result change morning reason research girl guy moment air teacher force education ' +
    'der die das und in den von zu mit sich des auf für ist im dem nicht ein eine als auch es an werden aus er hat dass sie nach wird bei einer um am sind noch wie einem über einen so zum war haben nur oder aber vor zur bis mehr durch man sein wurde sei wenn können diese schon ich mich mir du wir ihr ihm ihn uns euch was wer wo hier dort dann denn doch nun sehr immer wieder alle viele einige kein keine ohne unter zwischen gegen seit während weil damit jetzt heute jahr jahre zeit mensch menschen leben welt land stadt gut groß neu alt erste ganz ' +
    // fr
    'le la les un une des du de et ou mais donc car ni que qui quoi dont où ce cet cette ces son sa ses leur leurs mon ma mes ton ta tes nous vous ils elles elle il je tu on se ne pas plus très bien tout tous toute toutes dans pour avec sans sous sur entre vers chez par comme quand aussi alors encore même autre autres être avoir fait faire peut sont était été est ont ' +
    // it
    'il lo la gli le un uno una di da del della dei delle in con su per tra fra e o ma che chi cui non più anche come quando dove questo questa questi queste quello quella sono essere avere ha hanno era molto tutto tutti ogni altro altri ancora sempre poi così ' +
    // es
    'el la los las un una unos unas de del al en con por para sin sobre entre y o pero que quien cual cuando donde como este esta estos estas ese esa eso aquel muy más menos también todo todos otra otro otros sus su ser estar es son era fue han hay tiene puede ' +
    // ru
    'и в во не что он она оно они на я с со как а то все всё так его её их но да ты к у же вы за бы по только мне было было вот от меня ещё нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был была были него до вас нибудь опять уж вам ведь там потом себя ничего ей может тут где есть надо ней для мы тебя чем сам чтобы без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтоб нее сейчас куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это которые который которая ' +
    // zh
    '的 了 在 是 和 也 就 都 而 及 与 着 或 一个 没有 我们 你们 他们 她们 它们 这 那 这个 那个 这些 那些 因为 所以 但是 如果 可以 会 能 对 从 把 被 让 给 很 更 最 还 又 只 才 并 不 我 你 他 她 它 有 中 上 下 时 说 要 去 来 到 等 其 之 为 以 于 而且 虽然 已经 正在 自己 什么 怎么 这样 那样 一些'
  ).split(/\s+/),
);

export function isCommon(word: string): boolean {
  return COMMON.has(word.toLowerCase());
}
