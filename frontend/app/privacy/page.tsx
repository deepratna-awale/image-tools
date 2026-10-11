import type { Metadata } from "next";
import LegalPage, { CONTACT_URL } from "../components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | Image Tools",
  description: "What happens to the images you use with Image Tools, how long they are kept and what the server logs.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Image Tools (imagetools.top) is a free site with no accounts, no ads and no tracking. This page explains what
        happens to the images you use with it and what little information the server keeps.
      </p>

      <h2>Tools that run in your browser</h2>
      <p>
        <strong>Resize, Compress &amp; Convert</strong>, <strong>Remove Photo Metadata</strong>,{" "}
        <strong>Watermark &amp; Add Text</strong> and <strong>Images to PDF</strong> work entirely on your device. Your
        images are never sent to our server.
      </p>

      <h2>Tools that use the server</h2>
      <p>
        <strong>Background Remover</strong>, <strong>Background Changer</strong>, <strong>Blur Background</strong>,{" "}
        <strong>Passport &amp; ID Photo</strong>, <strong>Sky Swap</strong>, <strong>AI Shield</strong> and{" "}
        <strong>Prompt Reader</strong> send your image to our server to be processed.
      </p>
      <ul>
        <li>
          Images are processed on our own server by open-source models. They are not sent to any third-party AI service,
          not used to train any model and not looked at by anyone.
        </li>
        <li>
          For the processing tools, the uploaded image and the result are stored on the server so you can download
          the result. Both, along with the job record (its status and file name), are{" "}
          <strong>deleted automatically within about 24 hours</strong>.
        </li>
        <li>Prompt Reader reads your image in memory and does not store it.</li>
        <li>Anyone who knows a job&apos;s random ID can fetch its result until it is deleted, so don&apos;t share it.</li>
      </ul>

      <h2>Server logs</h2>
      <p>
        Like most websites, the server records basic request logs: the time, the page or API address requested, the
        response code and the network address the request came from. They are used only to keep the site running and
        to fix problems, are not shared or sold, and are overwritten as they rotate.
      </p>

      <h2>Cookies and analytics</h2>
      <p>
        The site uses no analytics, advertising or tracking cookies. Your browser stores your light or dark theme
        choice locally. On the admin-only API keys page, the admin token is kept in your browser&apos;s session storage
        until you close the tab.
      </p>

      <h2>API keys</h2>
      <p>
        If you are given an API key, the server stores only a one-way hash of it (never the key itself), its name, its
        daily limit, when it was created and last used, and how many images it processed each day. Images sent through
        the API are handled and deleted the same way as images from the site.
      </p>

      <h2>Hosting</h2>
      <p>
        The site runs on a single cloud server in the United States. If you use it from elsewhere, your images are
        processed there.
      </p>

      <h2>Children</h2>
      <p>The site is not aimed at children and does not knowingly collect information about them.</p>

      <h2>Changes and contact</h2>
      <p>
        If this policy changes, the date at the top will change with it. Questions or requests can go to{" "}
        <a href={CONTACT_URL}>our GitHub issues page</a>; issues there are public, so please don&apos;t include personal
        details or images you want kept private.
      </p>
    </LegalPage>
  );
}
