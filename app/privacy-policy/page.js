import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Link href="/" className="inline-block mb-8">
          <img src="/logo.png" alt="GarageLeadly" className="h-16" />
        </Link>

        <h1 className="text-4xl font-bold text-gray-900 mb-8">Privacy Policy</h1>

        <div className="prose prose-lg max-w-none">
          <p className="text-gray-600 mb-6"><strong>Last Updated:</strong> November 13, 2025</p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Introduction</h2>
            <p className="text-gray-700 mb-4">
              LR Acquisitions LLC d/b/a GarageLeadly ("we," "us," or "our") respects your privacy and is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our lead generation platform and services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Information We Collect</h2>

            <h3 className="text-xl font-bold text-gray-900 mb-3">Contractor Information</h3>
            <p className="text-gray-700 mb-4">When you sign up as a contractor, we collect:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Business name and contact information</li>
              <li>Personal name, email address, and phone number</li>
              <li>Service area and territory preferences</li>
              <li>Payment information and billing details</li>
              <li>SMS consent and communication preferences</li>
            </ul>

            <h3 className="text-xl font-bold text-gray-900 mb-3">Customer Lead Information</h3>
            <p className="text-gray-700 mb-4">When homeowners submit service requests, we collect:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Name, phone number, and email address</li>
              <li>Service address and location</li>
              <li>Description of service needed</li>
              <li>Property type (residential/commercial)</li>
            </ul>

            <h3 className="text-xl font-bold text-gray-900 mb-3">Automatically Collected Information</h3>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>IP address and device information</li>
              <li>Browser type and operating system</li>
              <li>Pages visited and time spent on our website</li>
              <li>Referring website and search terms used</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">How We Use Your Information</h2>
            <p className="text-gray-700 mb-4">We use the information we collect to:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Deliver exclusive leads to contractors via SMS and email</li>
              <li>Process payments and manage subscriptions</li>
              <li>Provide customer support and respond to inquiries</li>
              <li>Improve our platform and develop new features</li>
              <li>Send service updates and important notifications</li>
              <li>Analyze platform usage and performance</li>
              <li>Prevent fraud and ensure platform security</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">How We Share Your Information</h2>

            <h3 className="text-xl font-bold text-gray-900 mb-3">Lead Distribution</h3>
            <p className="text-gray-700 mb-4">
              Customer lead information is shared exclusively with ONE contractor in the designated service territory. We never sell or share leads with multiple contractors.
            </p>

            <h3 className="text-xl font-bold text-gray-900 mb-3">Service Providers</h3>
            <p className="text-gray-700 mb-4">We may share information with trusted third-party service providers who assist us with:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Payment processing (Stripe)</li>
              <li>SMS delivery (Twilio)</li>
              <li>Email communications</li>
              <li>Data storage and hosting</li>
              <li>Analytics and performance monitoring</li>
            </ul>

            <h3 className="text-xl font-bold text-gray-900 mb-3">Legal Requirements</h3>
            <p className="text-gray-700 mb-4">
              We may disclose your information if required by law, court order, or government request, or to protect our rights, property, or safety.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">SMS Communications</h2>
            <p className="text-gray-700 mb-4">
              By providing your phone number and consenting to receive text messages, you agree to receive lead notifications via SMS. Standard message and data rates may apply. You can opt out at any time by replying STOP to any message.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Data Security</h2>
            <p className="text-gray-700 mb-4">
              We implement industry-standard security measures to protect your information, including encryption, secure servers, and access controls. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Data Retention</h2>
            <p className="text-gray-700 mb-4">
              We retain your information for as long as your account is active or as needed to provide services. We may retain certain information for legitimate business purposes or as required by law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Rights and Choices</h2>
            <p className="text-gray-700 mb-4">You have the right to:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Access and update your personal information</li>
              <li>Request deletion of your account and data</li>
              <li>Opt out of marketing communications</li>
              <li>Opt out of SMS notifications (reply STOP)</li>
              <li>Request a copy of your data</li>
            </ul>
            <p className="text-gray-700 mb-4">
              To exercise these rights, contact us at <a href="mailto:support@garageleadly.com" className="text-blue-600 hover:underline">support@garageleadly.com</a>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Cookies and Tracking</h2>
            <p className="text-gray-700 mb-4">
              We use cookies and similar tracking technologies to enhance your experience, analyze usage, and deliver targeted advertising. You can control cookies through your browser settings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Children's Privacy</h2>
            <p className="text-gray-700 mb-4">
              Our services are not intended for children under 18. We do not knowingly collect information from children. If you believe we have collected information from a child, please contact us immediately.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Changes to This Policy</h2>
            <p className="text-gray-700 mb-4">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on our website and updating the "Last Updated" date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact Us</h2>
            <p className="text-gray-700 mb-2">
              If you have questions about this Privacy Policy, please contact us:
            </p>
            <p className="text-gray-700 mb-2">
              <strong>LR Acquisitions LLC d/b/a GarageLeadly</strong><br />
              32 North Gould Street<br />
              Sheridan, WY 82801<br />
              United States
            </p>
            <p className="text-gray-700">
              Email: <a href="mailto:support@garageleadly.com" className="text-blue-600 hover:underline">support@garageleadly.com</a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
