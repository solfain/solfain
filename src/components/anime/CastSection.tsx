import { useMemo, useState } from 'react';
import { User } from 'lucide-react';
import type { CharacterEdge, VoiceActorNode } from '../../types/anime';
import { sanitizeHttpUrl, sanitizePlainText } from '../../utils/security';

export interface CastSectionProps {
  characters: CharacterEdge[];
}

type CastLanguage = 'JAPANESE' | 'ENGLISH';

function pickVoiceActor(
  voiceActors: VoiceActorNode[] | undefined,
  lang: CastLanguage,
): VoiceActorNode | null {
  if (!voiceActors || voiceActors.length === 0) return null;
  const target = lang === 'ENGLISH' ? 'english' : 'japanese';
  return (
    voiceActors.find((va) => va.languageV2?.trim().toLowerCase() === target) ?? null
  );
}

export function CastSection({ characters }: CastSectionProps) {
  const [language, setLanguage] = useState<CastLanguage>('JAPANESE');

  const hasEnglishCast = useMemo(
    () =>
      characters.some((edge) =>
        edge.voiceActors?.some(
          (va) => va.languageV2?.trim().toLowerCase() === 'english',
        ),
      ),
    [characters],
  );

  if (!characters || characters.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="cast-heading">
      <div className="section-header" style={{ marginBottom: '12px' }}>
        <div className="section-header__titles">
          <h2 id="cast-heading" className="section-title">
            Characters & Voice Cast
          </h2>
        </div>

        {hasEnglishCast && (
          <div
            className="segmented-control"
            role="group"
            aria-label="Voice actor language"
          >
            <button
              type="button"
              className={`segmented-control__btn${
                language === 'JAPANESE' ? ' segmented-control__btn--active' : ''
              }`}
              aria-pressed={language === 'JAPANESE'}
              onClick={() => setLanguage('JAPANESE')}
            >
              JP Cast
            </button>
            <button
              type="button"
              className={`segmented-control__btn${
                language === 'ENGLISH' ? ' segmented-control__btn--active' : ''
              }`}
              aria-pressed={language === 'ENGLISH'}
              onClick={() => setLanguage('ENGLISH')}
            >
              EN Cast
            </button>
          </div>
        )}
      </div>

      <div className="cast-grid">
        {characters.slice(0, 12).map((edge) => {
          const charName =
            sanitizePlainText(edge.node.name?.full || edge.node.name?.native, 90) ||
            'Character';
          const charImg = sanitizeHttpUrl(
            edge.node.image?.large || edge.node.image?.medium,
            { httpsOnly: true },
          );
          const roleLabel =
            edge.role === 'MAIN'
              ? 'Main'
              : edge.role === 'SUPPORTING'
                ? 'Supporting'
                : 'Cast';

          const va = pickVoiceActor(edge.voiceActors, language);
          const vaName = va
            ? sanitizePlainText(va.name?.full || va.name?.native, 90)
            : '';
          const vaImg = va
            ? sanitizeHttpUrl(va.image?.large || va.image?.medium, {
                httpsOnly: true,
              })
            : null;

          return (
            <article key={`${edge.id}-${edge.node.id}`} className="cast-card">
              <div className="cast-card__side">
                {charImg ? (
                  <img
                    src={charImg}
                    alt=""
                    className="cast-card__avatar"
                    loading="lazy"
                  />
                ) : (
                  <div className="cast-card__avatar cast-card__avatar--fallback">
                    <User size={15} aria-hidden="true" />
                  </div>
                )}
                <div className="cast-card__text">
                  <span className="cast-card__name">{charName}</span>
                  <span className="cast-card__sub">{roleLabel}</span>
                </div>
              </div>

              {va && vaName && (
                <div className="cast-card__side cast-card__side--right">
                  <div className="cast-card__text cast-card__text--right">
                    <span className="cast-card__name">{vaName}</span>
                    <span className="cast-card__sub">
                      {language === 'ENGLISH' ? 'English' : 'Japanese'}
                    </span>
                  </div>
                  {vaImg ? (
                    <img
                      src={vaImg}
                      alt=""
                      className="cast-card__avatar"
                      loading="lazy"
                    />
                  ) : (
                    <div className="cast-card__avatar cast-card__avatar--fallback">
                      <User size={15} aria-hidden="true" />
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
