import { t, type Key } from '../i18n';

const EVIDENCE = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'] as const;
const MYTHS = ['m1', 'm2', 'm3', 'm4', 'm5'] as const;

function Item({ id, pill, ok }: { id: string; pill: string; ok?: boolean }) {
  return (
    <li>
      <span className={`pill${ok ? ' ok' : ''}`}>{pill}</span>
      <strong>{t(`sci.${id}.t` as Key)}</strong> {t(`sci.${id}.b` as Key)}
    </li>
  );
}

export function Science() {
  return (
    <div className="page prose">
      <h1>{t('sci.title')}</h1>
      <p className="lede">{t('sci.lede')}</p>

      <h2>{t('sci.does')}</h2>
      <ul>
        {EVIDENCE.map((id) => <Item key={id} id={id} pill={t('sci.evidence')} ok />)}
      </ul>

      <h2>{t('sci.leaves')}</h2>
      <ul>
        {MYTHS.map((id) => <Item key={id} id={id} pill={t('sci.myth')} />)}
      </ul>

      <h2>{t('sci.how')}</h2>
      <ol>
        <li>{t('sci.h1')}</li>
        <li>{t('sci.h2')}</li>
        <li>{t('sci.h3')}</li>
        <li>{t('sci.h4')}</li>
      </ol>

      <h2>{t('sci.refs')}</h2>
      <ul className="refs">
        <li>Rayner, K., Schotter, E. R., Masson, M. E. J., Potter, M. C., &amp; Treiman, R. (2016). So much to read, so little time: How do we read, and can speed reading help? <em>Psychological Science in the Public Interest, 17</em>(1), 4–34.</li>
        <li>Rayner, K. (1998). Eye movements in reading and information processing: 20 years of research. <em>Psychological Bulletin, 124</em>(3), 372–422.</li>
        <li>Schotter, E. R., Tran, R., &amp; Rayner, K. (2014). Don't believe what you read (only once): Comprehension is supported by regressions during reading. <em>Psychological Science, 25</em>(6), 1218–1226.</li>
        <li>Kliegl, R., Grabner, E., Rolfs, M., &amp; Engbert, R. (2004). Length, frequency, and predictability effects of words on eye movements in reading. <em>European Journal of Cognitive Psychology, 16</em>, 262–284.</li>
        <li>Just, M. A., &amp; Carpenter, P. A. (1980). A theory of reading: From eye fixations to comprehension. <em>Psychological Review, 87</em>(4), 329–354.</li>
        <li>Duggan, G. B., &amp; Payne, S. J. (2009). Text skimming: The process and effectiveness of foraging through text under time pressure. <em>Journal of Experimental Psychology: Applied, 15</em>(3), 228–242.</li>
        <li>Benedetto, S., Carbone, A., Pedrotti, M., Le Fevre, K., Bey, L. A. Y., &amp; Baccino, T. (2015). Rapid serial visual presentation in reading: The case of Spritz. <em>Computers in Human Behavior, 45</em>, 352–358.</li>
        <li>Kaernbach, C. (1991). Simple adaptive testing with the weighted up-down method. <em>Perception &amp; Psychophysics, 49</em>(3), 227–229.</li>
        <li>Taylor, W. L. (1953). "Cloze procedure": A new tool for measuring readability. <em>Journalism Quarterly, 30</em>(4), 415–433.</li>
      </ul>
    </div>
  );
}
