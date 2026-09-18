import { RouteDiagram } from './route-diagram'
import { LandingContainer, SectionHeading } from './section-heading'

export function RouteSection() {
  return (
    <section aria-labelledby="szamla-utja" className="border-b border-rule bg-surface">
      <LandingContainer className="py-14 lg:py-20">
        <SectionHeading id="szamla-utja" title="Egy számla útja, a kódodtól a vevő postafiókjáig.">
          A zöld doboz a kassza. Ami benne történik, azt a nyers Agent API mellett neked kellene
          megírnod, tesztelned és karbantartanod.
        </SectionHeading>
        <div className="mt-10 lg:mt-14">
          <RouteDiagram />
        </div>
      </LandingContainer>
    </section>
  )
}
