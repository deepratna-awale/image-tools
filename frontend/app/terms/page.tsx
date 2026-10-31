import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { CONTACT_URL } from "../components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Use | Image Tools",
  description: "The rules for using Image Tools and its developer API.",
};

const REPO = "https://github.com/deepratna-awale/image-tools";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        By using Image Tools (imagetools.top), including its developer API, you agree to these terms. If you don&apos;t
        agree, please don&apos;t use the site.
      </p>

      <h2>Your images</h2>
      <ul>
        <li>
          You keep all rights to the images you use and to the results. We claim no ownership and use your images only
          to run the tool you chose, as described in the <Link href="/privacy">Privacy Policy</Link>.
        </li>
        <li>Only use images you have the right to use, and make sure your results don&apos;t infringe anyone else&apos;s rights.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Don&apos;t use the site or the API to:</p>
      <ul>
        <li>process anything illegal, including sexual content involving minors;</li>
        <li>harass, impersonate or deceive people, or make intimate or misleading images of real people without their consent;</li>
        <li>overload the server, scrape it, probe it for weaknesses, or get around its size, rate or daily limits;</li>
        <li>resell access to the site or the API as your own service.</li>
      </ul>
      <p>We may block requests, revoke API keys or remove content that breaks these rules, without notice.</p>

      <h2>Developer API</h2>
      <ul>
        <li>
          API keys are issued by the site&apos;s administrator. Keep your key secret: you are responsible for what is
          done with it, and a key that leaks or is misused will be revoked.
        </li>
        <li>
          Each key is limited to <strong>20 submissions and 300 status or result requests a minute</strong>, and by
          default <strong>200 images a day</strong> (reset at 00:00 UTC). All keys together share a daily ceiling of{" "}
          <strong>1,000 images</strong>. Requests over a limit are refused with HTTP 429. Limits may change.
        </li>
        <li>
          The API is free, comes with no uptime or support guarantee, and may change or be withdrawn. Details are in{" "}
          <a href={`${REPO}/blob/main/docs/API.md`}>the API documentation</a>.
        </li>
      </ul>

      <h2>No guarantees</h2>
      <p>
        The site is provided free, &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind. Results
        come from automated models and can be wrong. In particular, we don&apos;t guarantee that a passport or ID photo
        will be accepted by any authority, that AI Shield will stop every AI model now or in the future, or that the site
        will always be online. Keep your own copies of anything important.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent the law allows, we are not liable for any indirect or consequential loss, or for any loss of data,
        profit or business, arising from your use of the site or the API.
      </p>

      <h2>Open source and third-party licenses</h2>
      <p>
        The site&apos;s code is open source under the <a href={`${REPO}/blob/main/LICENSE`}>MIT License</a>. Some parts
        it relies on have their own licenses, for example:
      </p>
      <ul>
        <li>
          Sky Swap uses the SegFormer model, released by NVIDIA under a <strong>non-commercial</strong> license.
        </li>
        <li>HEIC/HEIF images are opened with libheif, under the LGPL.</li>
        <li>
          Background Remover and Background Changer use BRIA RMBG 2.0 through rembg, released by BRIA AI under a{" "}
          <strong>non-commercial</strong> license (CC BY-NC 4.0).
        </li>
        <li>
          Watermark Remover and Outpainting use FLUX.1 Kontext [dev], released by Black Forest Labs under a{" "}
          <strong>non-commercial</strong> license.
        </li>
      </ul>
      <p>If you run your own copy of the site, check those licenses fit what you plan to do with it.</p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms; the date at the top shows the latest version, and using the site after a change
        means you accept it. Questions can go to <a href={CONTACT_URL}>our GitHub issues page</a>.
      </p>
    </LegalPage>
  );
}
