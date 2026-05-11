import Hero from './components/Hero';
import FlowNarrative from './components/FlowNarrative';
import HowItWorks from './components/HowItWorks';
import WhyMyTeam from './components/WhyMyTeam';
import Architecture from './components/Architecture';
import Quickstart from './components/Quickstart';
import GettingStarted from './components/GettingStarted';
import Footer from './components/Footer';

export default function Page() {
  return (
    <main className="min-h-screen">
      <Hero />
      <FlowNarrative />
      <HowItWorks />
      <WhyMyTeam />
      <Architecture />
      <Quickstart />
      <GettingStarted />
      <Footer />
    </main>
  );
}
