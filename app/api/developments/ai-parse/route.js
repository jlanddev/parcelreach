import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

/**
 * POST /api/developments/ai-parse
 * Use AI to parse city planning documents and extract development proposals
 */
export async function POST(request) {
  try {
    const { city, documentText } = await request.json();

    if (!documentText) {
      return NextResponse.json({ error: 'No document text provided' }, { status: 400 });
    }

    // Initialize Claude
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const prompt = `You are analyzing a city planning document to extract real estate development proposals.

Extract ALL development proposals from this document and return them as a JSON array. For each proposal, extract:
- project_name: Name of the development
- developer: Company or person developing
- location: Full address or location description
- type: Type of development (commercial, multifamily, subdivision, mixed-use, office, retail, industrial, etc.)
- description: Brief description of what's being proposed
- units: Number of units (if residential/multifamily)
- acreage: Size in acres (if mentioned)
- status: Current status (proposed, approved, under review, etc.)

Focus on MAJOR developments only:
- New commercial buildings
- Multifamily/apartment complexes
- Subdivisions
- Office buildings
- Mixed-use developments
- Rezoning for major projects

IGNORE:
- Small home additions
- Minor variances
- Individual home permits

Return ONLY a valid JSON array, no other text.

Document to analyze:
${documentText.substring(0, 50000)}

JSON Array:`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Parse AI response
    let proposals = [];
    try {
      const responseText = message.content[0].text;
      // Remove markdown code blocks if present
      const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      proposals = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return NextResponse.json({
        error: 'Failed to parse AI response',
        rawResponse: message.content[0].text
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      city,
      count: proposals.length,
      proposals
    });

  } catch (error) {
    console.error('AI parsing error:', error);
    return NextResponse.json(
      { error: 'Failed to parse document', details: error.message },
      { status: 500 }
    );
  }
}
