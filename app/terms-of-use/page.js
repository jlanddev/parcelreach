import Link from 'next/link';

export default function TermsOfUsePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Link href="/" className="inline-block mb-8">
          <img src="/logo.png" alt="GarageLeadly" className="h-16" />
        </Link>

        <h1 className="text-4xl font-bold text-gray-900 mb-8">Terms of Use</h1>

        <div className="prose prose-lg max-w-none">
          <p className="text-gray-600 mb-6"><strong>Last Updated:</strong> November 13, 2025</p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Agreement to Terms</h2>
            <p className="text-gray-700 mb-4">
              By accessing or using the GarageLeadly platform and services provided by LR Acquisitions LLC ("GarageLeadly," "we," "us," or "our"), you agree to be bound by these Terms of Use and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using our services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Description of Services</h2>
            <p className="text-gray-700 mb-4">
              GarageLeadly is a lead generation platform that connects homeowners seeking garage door repair and installation services with qualified contractors. We provide:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Exclusive lead delivery via SMS and email</li>
              <li>Territory-protected service areas</li>
              <li>Lead management dashboard and CRM tools</li>
              <li>Performance analytics and reporting</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Contractor Requirements</h2>
            <p className="text-gray-700 mb-4">To use our services as a contractor, you must:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Be a licensed and insured garage door service provider</li>
              <li>Provide accurate business and contact information</li>
              <li>Maintain professional standards and quality service</li>
              <li>Respond to leads promptly (within 24 hours recommended)</li>
              <li>Comply with all applicable laws and regulations</li>
              <li>Not resell or share leads with third parties</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Lead Delivery and Exclusivity</h2>
            <p className="text-gray-700 mb-4">
              Each lead is delivered to ONE contractor only within the designated service territory. Leads are exclusive and will never be sold to multiple contractors. We limit the number of contractors per territory to ensure quality and exclusivity.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Payment Terms</h2>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Contractors are charged per lead delivered</li>
              <li>Payment is processed automatically via credit card on file</li>
              <li>All fees are non-refundable except as outlined in our Refund Policy</li>
              <li>Subscription fees (if applicable) are billed monthly or annually</li>
              <li>Failed payments may result in service suspension</li>
              <li>You are responsible for all charges incurred on your account</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Account Suspension and Termination</h2>
            <p className="text-gray-700 mb-4">We reserve the right to suspend or terminate your account if:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>You violate these Terms of Use</li>
              <li>You provide false or misleading information</li>
              <li>You engage in fraudulent activity</li>
              <li>You receive excessive customer complaints</li>
              <li>Payment issues remain unresolved</li>
              <li>You damage the reputation of our platform</li>
            </ul>
            <p className="text-gray-700 mb-4">
              You may cancel your account at any time by contacting support. Cancellation does not entitle you to a refund of any fees already paid.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Lead Quality and Disclaimers</h2>
            <p className="text-gray-700 mb-4">
              While we strive to provide high-quality leads, we cannot guarantee:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>That customers will hire you or complete the transaction</li>
              <li>The accuracy of all customer-provided information</li>
              <li>Any specific lead volume or frequency</li>
              <li>That leads will result in profitable jobs</li>
              <li>Customer behavior, responsiveness, or decision-making</li>
            </ul>
            <p className="text-gray-700 mb-4">
              Contractors are solely responsible for evaluating leads, providing quotes, and completing services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Limitation of Liability</h2>
            <p className="text-gray-700 mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, GARAGELEADLY SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
            </p>
            <p className="text-gray-700 mb-4">
              Our total liability to you for any claims arising from your use of our services shall not exceed the amount you paid us in the 12 months prior to the claim.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Indemnification</h2>
            <p className="text-gray-700 mb-4">
              You agree to indemnify, defend, and hold harmless GarageLeadly, LR Acquisitions LLC, and our officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including legal fees) arising from:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Your use of our services</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any rights of another party</li>
              <li>Your services provided to customers</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Intellectual Property</h2>
            <p className="text-gray-700 mb-4">
              All content, features, and functionality of the GarageLeadly platform, including but not limited to text, graphics, logos, software, and design, are owned by LR Acquisitions LLC and protected by copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works without our express written permission.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">SMS Communications</h2>
            <p className="text-gray-700 mb-4">
              By providing your phone number and consenting to SMS notifications, you agree to receive text messages containing lead information. Standard message and data rates may apply. You can opt out at any time by replying STOP to any message.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Governing Law and Dispute Resolution</h2>
            <p className="text-gray-700 mb-4">
              These Terms shall be governed by and construed in accordance with the laws of the State of Wyoming, without regard to its conflict of law provisions. Any disputes arising from these Terms or your use of our services shall be resolved through binding arbitration in Sheridan County, Wyoming.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Changes to Terms</h2>
            <p className="text-gray-700 mb-4">
              We reserve the right to modify these Terms at any time. We will notify you of any material changes by posting the updated Terms on our website and updating the "Last Updated" date. Your continued use of our services after changes are posted constitutes acceptance of the modified Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Severability</h2>
            <p className="text-gray-700 mb-4">
              If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact Information</h2>
            <p className="text-gray-700 mb-2">
              If you have questions about these Terms of Use, please contact us:
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

          <section className="mb-8 bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
            <p className="text-gray-700 font-semibold">
              By using GarageLeadly, you acknowledge that you have read, understood, and agree to be bound by these Terms of Use.
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
