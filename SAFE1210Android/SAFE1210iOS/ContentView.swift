import SwiftUI
import WebKit

@MainActor
final class StoreBrowserModel: ObservableObject {
    @Published var progress = 0.0
    @Published var canGoBack = false
    @Published var loadFailed = false

    weak var webView: WKWebView?

    func goBack() {
        guard let webView, webView.canGoBack else { return }
        webView.goBack()
    }

    func reload() {
        loadFailed = false
        webView?.reload()
    }
}

struct ContentView: View {
    @StateObject private var browser = StoreBrowserModel()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button(action: browser.goBack) {
                    Image(systemName: "chevron.backward")
                        .frame(width: 40, height: 42)
                }
                .disabled(!browser.canGoBack)
                .accessibilityLabel("ย้อนกลับ")

                Spacer(minLength: 0)

                Text("SAFE1210")
                    .font(.headline)
                    .foregroundStyle(.white)

                Spacer(minLength: 0)

                Button(action: browser.reload) {
                    Image(systemName: "arrow.clockwise")
                        .frame(width: 40, height: 42)
                }
                .accessibilityLabel("โหลดหน้าใหม่")
            }
            .buttonStyle(.plain)
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .background(Color(red: 16 / 255, green: 49 / 255, blue: 74 / 255))

            if browser.progress < 1 {
                ProgressView(value: browser.progress)
                    .tint(Color(red: 0 / 255, green: 145 / 255, blue: 186 / 255))
                    .frame(height: 3)
            }

            ZStack {
                StoreWebView(browser: browser)

                if browser.loadFailed {
                    VStack(spacing: 12) {
                        Image(systemName: "wifi.exclamationmark")
                            .font(.system(size: 34))
                            .foregroundStyle(Color(red: 16 / 255, green: 49 / 255, blue: 74 / 255))
                        Text("เชื่อมต่อร้านค้าไม่ได้")
                            .font(.title3.weight(.semibold))
                        Text("ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Button("ลองอีกครั้ง", action: browser.reload)
                            .buttonStyle(.borderedProminent)
                            .tint(Color(red: 0 / 255, green: 127 / 255, blue: 165 / 255))
                    }
                    .multilineTextAlignment(.center)
                    .padding(28)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.white)
                }
            }
        }
        .background(.white)
        .preferredColorScheme(.light)
    }
}

private struct StoreWebView: UIViewRepresentable {
    @ObservedObject var browser: StoreBrowserModel

    func makeCoordinator() -> Coordinator {
        Coordinator(browser: browser)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        browser.webView = webView

        if let storeURL = URL(string: "https://safe1210.com/") {
            webView.load(URLRequest(url: storeURL))
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        private let browser: StoreBrowserModel
        private var progressObservation: NSKeyValueObservation?
        private var backObservation: NSKeyValueObservation?

        init(browser: StoreBrowserModel) {
            self.browser = browser
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            browser.loadFailed = false
            observe(webView)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            browser.progress = 1
            browser.canGoBack = webView.canGoBack
            browser.loadFailed = false
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            showLoadError(for: error)
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            showLoadError(for: error)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url,
                  let scheme = url.scheme?.lowercased() else {
                decisionHandler(.cancel)
                return
            }

            if scheme == "https" || scheme == "http" {
                decisionHandler(.allow)
            } else {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            }
        }

        private func observe(_ webView: WKWebView) {
            progressObservation = webView.observe(\.estimatedProgress, options: [.initial, .new]) { [weak self] view, _ in
                Task { @MainActor in
                    self?.browser.progress = view.estimatedProgress
                    self?.browser.canGoBack = view.canGoBack
                }
            }
            backObservation = webView.observe(\.canGoBack, options: [.new]) { [weak self] view, _ in
                Task { @MainActor in
                    self?.browser.canGoBack = view.canGoBack
                }
            }
        }

        private func showLoadError(for error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            browser.progress = 1
            browser.loadFailed = true
        }
    }
}
