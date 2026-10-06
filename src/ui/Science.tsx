export function Science() {
  return (
    <div className="page prose">
      <h1>What the science says</h1>
      <p className="lede">
        Most speed-reading claims don't survive contact with eye-tracking research. Lumen is built only on what does.
      </p>

      <h2>What Lumen does — and why</h2>
      <ul>
        <li>
          <span className="pill ok">Evidence</span><strong>Measures effective rate, not raw speed.</strong> Speed and comprehension trade off
          (Rayner et al., 2016). Your score is WPM × comprehension, checked with cloze questions — a validated comprehension proxy (Taylor, 1953).
        </li>
        <li>
          <span className="pill ok">Evidence</span><strong>Adapts the pace to you.</strong> An up/down staircase (Kaernbach, 1991) raises speed when you
          understand well and eases off when you don't, converging on the fastest pace that keeps ~75&nbsp;% comprehension.
        </li>
        <li>
          <span className="pill ok">Evidence</span><strong>Times words like your eyes do.</strong> Long and rare words get more time, short frequent ones less
          (Kliegl et al., 2004); clause and sentence ends get a pause for integration (Just &amp; Carpenter, 1980). Averaged out, the speed shown is exact.
        </li>
        <li>
          <span className="pill ok">Evidence</span><strong>Pacer mode keeps the page.</strong> About 10–15&nbsp;% of eye movements are regressions, and blocking them
          hurts comprehension (Schotter, Tran &amp; Rayner, 2014). The pacer pushes you forward but lets you look back and preview the next words.
        </li>
        <li>
          <span className="pill ok">Evidence</span><strong>Focus mode fixes your gaze at the optimal point.</strong> Words are recognised fastest when fixated slightly
          left of centre (O'Regan &amp; Jacobs, 1992). RSVP is good for short, easy text; after a pause it rewinds to the sentence start because it removes
          look-backs (Benedetto et al., 2015).
        </li>
        <li>
          <span className="pill ok">Evidence</span><strong>Practice with real text.</strong> The strongest predictor of reading speed is language skill —
          vocabulary and familiarity with the material (Rayner et al., 2016). Regular, varied reading at a slightly challenging pace is the training.
        </li>
      </ul>

      <h2>What Lumen deliberately leaves out</h2>
      <ul>
        <li><span className="pill">Myth</span><strong>Reading whole lines or pages at a glance.</strong> Sharp vision spans ~7–8 letters; the perceptual span can't be trained past ~15 characters (Rayner, 1998).</li>
        <li><span className="pill">Myth</span><strong>Eliminating subvocalisation.</strong> Inner speech supports comprehension; suppressing it lowers understanding of complex text.</li>
        <li><span className="pill">Myth</span><strong>Eye-muscle exercises.</strong> Saccade speed isn't the bottleneck — word recognition and comprehension are.</li>
        <li><span className="pill">Myth</span><strong>1,000+ wpm with full comprehension.</strong> Above ~500–600 wpm, measured comprehension drops toward skimming levels.</li>
      </ul>

      <h2>How to train</h2>
      <ol>
        <li>Take the speed test to find your natural pace.</li>
        <li>Read 10–20 minutes a day with training on, in Pacer mode, using material you actually want to read.</li>
        <li>Let the pace adapt. If comprehension stays high, you're getting faster for real.</li>
        <li>Retest every couple of weeks on fresh text — that's your honest progress.</li>
      </ol>

      <h2>References</h2>
      <ul className="refs">
        <li>Rayner, K., Schotter, E. R., Masson, M. E. J., Potter, M. C., &amp; Treiman, R. (2016). So much to read, so little time: How do we read, and can speed reading help? <em>Psychological Science in the Public Interest, 17</em>(1), 4–34.</li>
        <li>Rayner, K. (1998). Eye movements in reading and information processing: 20 years of research. <em>Psychological Bulletin, 124</em>(3), 372–422.</li>
        <li>Schotter, E. R., Tran, R., &amp; Rayner, K. (2014). Don't believe what you read (only once): Comprehension is supported by regressions during reading. <em>Psychological Science, 25</em>(6), 1218–1226.</li>
        <li>Kliegl, R., Grabner, E., Rolfs, M., &amp; Engbert, R. (2004). Length, frequency, and predictability effects of words on eye movements in reading. <em>European Journal of Cognitive Psychology, 16</em>, 262–284.</li>
        <li>Just, M. A., &amp; Carpenter, P. A. (1980). A theory of reading: From eye fixations to comprehension. <em>Psychological Review, 87</em>(4), 329–354.</li>
        <li>O'Regan, J. K., &amp; Jacobs, A. M. (1992). Optimal viewing position effect in word recognition. <em>JEP: Human Perception and Performance, 18</em>(1), 185–197.</li>
        <li>Benedetto, S., Carbone, A., Pedrotti, M., Le Fevre, K., Bey, L. A. Y., &amp; Baccino, T. (2015). Rapid serial visual presentation in reading: The case of Spritz. <em>Computers in Human Behavior, 45</em>, 352–358.</li>
        <li>Kaernbach, C. (1991). Simple adaptive testing with the weighted up-down method. <em>Perception &amp; Psychophysics, 49</em>(3), 227–229.</li>
        <li>Taylor, W. L. (1953). "Cloze procedure": A new tool for measuring readability. <em>Journalism Quarterly, 30</em>(4), 415–433.</li>
      </ul>
    </div>
  );
}
