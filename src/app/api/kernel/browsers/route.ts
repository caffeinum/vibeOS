import { NextResponse } from 'next/server';
import Kernel from '@onkernel/sdk';

export async function POST(req: Request) {
  console.log('[kernel/browsers] POST request received');

  try {
    const body = await req.json();
    const apiKey = req.headers.get('authorization')?.replace('Bearer ', '');

    console.log('[kernel/browsers] API key present:', !!apiKey);

    if (!apiKey) {
      console.log('[kernel/browsers] No API key provided');
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 401 }
      );
    }

    // Create Kernel client and browser
    console.log('[kernel/browsers] Creating Kernel client...');
    const client = new Kernel({
      apiKey: apiKey
    });

    console.log('[kernel/browsers] Creating browser...');
    const browser = await client.browsers.create();

    console.log('[kernel/browsers] Browser created successfully:', browser);

    // Use type assertion to access properties
    const browserData = browser as any;

    return NextResponse.json({
      id: browserData.id || browserData.browser_id || browserData.browserId,
      cdp_ws_url: browserData.cdp_ws_url || browserData.cdpWsUrl,
      browser_live_view_url: browserData.browser_live_view_url || browserData.browserLiveViewUrl
    });

  } catch (error) {
    console.error('[kernel/browsers] Error creating Kernel browser:', error);
    return NextResponse.json(
      { error: `Failed to create browser: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const browserId = url.searchParams.get('browserId');
    const apiKey = req.headers.get('authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 401 }
      );
    }

    if (!browserId) {
      return NextResponse.json(
        { error: 'Browser ID is required' },
        { status: 400 }
      );
    }

    // Create Kernel client and close browser
    console.log('[kernel/browsers] Creating Kernel client for deletion...');
    const client = new Kernel({
      apiKey: apiKey
    });

    console.log('[kernel/browsers] Closing browser:', browserId);

    // Use direct API call for now to avoid SDK method issues
    const response = await fetch(`https://api.onkernel.com/v1/browsers/${browserId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Failed to close browser: ${response.status} ${errorData}`);
    }

    console.log('[kernel/browsers] Browser closed successfully');
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[kernel/browsers] Error closing Kernel browser:', error);
    return NextResponse.json(
      { error: `Failed to close browser: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
