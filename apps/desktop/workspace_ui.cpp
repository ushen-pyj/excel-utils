#include "workspace_ui.h"
#include <QApplication>
#include <QCollator>
#include <QColorDialog>
#include <QDir>
#include <QDirIterator>
#include <QEasingCurve>
#include <QFileInfo>
#include <QFontMetrics>
#include <QFrame>
#include <QGraphicsDropShadowEffect>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QLinearGradient>
#include <QMouseEvent>
#include <QPainter>
#include <QPainterPath>
#include <QParallelAnimationGroup>
#include <QPixmap>
#include <QPropertyAnimation>
#include <QScreen>
#include <QToolButton>
#include <QVBoxLayout>
#include <QWindow>
#include <QtMath>
#include <windows.h>

namespace ExcelUi {

namespace {
QColor blendColor(const QColor& from, const QColor& to, qreal t) {
    const qreal k = qBound(0.0, t, 1.0);
    return QColor(
        qRound(from.red() + (to.red() - from.red()) * k),
        qRound(from.green() + (to.green() - from.green()) * k),
        qRound(from.blue() + (to.blue() - from.blue()) * k),
        qRound(from.alpha() + (to.alpha() - from.alpha()) * k));
}

QColor adjustLightness(const QColor& c, qreal delta) {
    QColor hsl = c.toHsl();
    const qreal l = qBound(0.06, hsl.lightnessF() + delta, 0.94);
    hsl.setHslF(hsl.hslHueF(), hsl.hslSaturationF(), l, c.alphaF());
    return hsl.toRgb();
}

void drawKeycap(QPainter* painter, const QRectF& rect, const QString& text, const QFont& font,
                const QColor& bg, const QColor& border, const QColor& fg, qreal radius) {
    painter->save();
    painter->setRenderHint(QPainter::Antialiasing, true);
    painter->setPen(QPen(border, 1.0));
    painter->setBrush(bg);
    painter->drawRoundedRect(rect.adjusted(0.5, 0.5, -0.5, -0.5), radius, radius);
    painter->setFont(font);
    painter->setPen(fg);
    painter->drawText(rect, Qt::AlignCenter, text);
    painter->restore();
}

ThemePalette buildPalette(bool dark, const QString& accentIdOrHex) {
    ThemePalette t;
    t.dark = dark;
    const auto& presets = accentPresets();

    QColor baseAccent;
    bool matchedPreset = false;
    for (const auto& preset : presets) {
        if (preset.id.compare(accentIdOrHex, Qt::CaseInsensitive) == 0) {
            t.accentId = preset.id;
            t.accentLabel = preset.label;
            baseAccent = dark ? preset.darkColor : preset.lightColor;
            matchedPreset = true;
            break;
        }
    }
    if (!matchedPreset) {
        QColor custom(accentIdOrHex);
        if (custom.isValid()) {
            t.accentId = custom.name(QColor::HexRgb).toUpper();
            t.accentLabel = QStringLiteral("自定义 ") + t.accentId;
            if (dark && custom.lightnessF() < 0.48) {
                baseAccent = adjustLightness(custom, 0.56 - custom.lightnessF());
            } else if (!dark && custom.lightnessF() > 0.56) {
                baseAccent = adjustLightness(custom, 0.42 - custom.lightnessF());
            } else {
                baseAccent = custom;
            }
        } else {
            const auto& def = presets.first();
            t.accentId = def.id;
            t.accentLabel = def.label;
            baseAccent = dark ? def.darkColor : def.lightColor;
        }
    }

    t.accent = baseAccent;
    if (!dark) {
        t.accentHover = adjustLightness(baseAccent, -0.06);
        t.accentPressed = adjustLightness(baseAccent, -0.11);
        t.accentSoft = blendColor(QColor("#FFFFFF"), baseAccent, 0.11);
        t.accentSoftHover = blendColor(QColor("#FFFFFF"), baseAccent, 0.17);
        t.accentBorder = blendColor(QColor("#FFFFFF"), baseAccent, 0.34);
        t.accentText = adjustLightness(baseAccent, -0.10);
        t.accentMutedText = blendColor(QColor("#64748B"), baseAccent, 0.45);

        t.bgChrome = QColor("#EDF0F5");
        t.bgToolbar = QColor("#FFFFFF");
        t.bgRail = QColor("#F6F8FA");
        t.bgSidebar = QColor("#F6F8FA");
        t.bgSurface = QColor("#FFFFFF");
        t.bgCanvas = QColor("#F8FAFC");
        t.bgCanvasDot = QColor("#E2E8F0");
        t.bgCard = QColor("#FFFFFF");
        t.bgInput = QColor("#FFFFFF");
        t.bgHover = QColor("#EDF1F6");
        t.bgSelected = QColor("#EAEFF4");
        t.bgStatusBar = QColor("#F2F5F8");
        t.bgTabStrip = QColor("#F2F5F8");
        t.border = QColor("#E3E7EE");
        t.borderControl = QColor("#CFD6E0");

        t.textPrimary = QColor("#0F172A");
        t.textBody = QColor("#1E293B");
        t.textSecondary = QColor("#526071");
        t.textMuted = QColor("#64748B");
        t.textFaint = QColor("#94A3B8");
        t.iconNormal = QColor("#4B5563");

        t.kbdBg = QColor("#FFFFFF");
        t.kbdBorder = QColor("#D8DEE6");
        t.kbdText = QColor("#64748B");
        t.matchBg = QColor("#FDE68A");
        t.matchFg = QColor("#78350F");
        t.tooltipBg = QColor("#1E293B");
        t.tooltipFg = QColor("#F8FAFC");
        t.tooltipBorder = QColor("#334155");
        t.danger = QColor("#D92D20");
        t.liveDot = baseAccent;
    } else {
        t.accentHover = adjustLightness(baseAccent, 0.06);
        t.accentPressed = adjustLightness(baseAccent, -0.06);
        t.accentSoft = blendColor(QColor("#151C25"), baseAccent, 0.18);
        t.accentSoftHover = blendColor(QColor("#151C25"), baseAccent, 0.27);
        t.accentBorder = blendColor(QColor("#151C25"), baseAccent, 0.45);
        t.accentText = blendColor(baseAccent, QColor("#FFFFFF"), 0.25);
        t.accentMutedText = blendColor(QColor("#94A3B8"), baseAccent, 0.45);

        t.bgChrome = QColor("#0E131A");
        t.bgToolbar = QColor("#161D27");
        t.bgRail = QColor("#121821");
        t.bgSidebar = QColor("#151C25");
        t.bgSurface = QColor("#19212D");
        t.bgCanvas = QColor("#111720");
        t.bgCanvasDot = QColor("#212C3B");
        t.bgCard = QColor("#1C2532");
        t.bgInput = QColor("#111720");
        t.bgHover = QColor("#222C3A");
        t.bgSelected = QColor("#253142");
        t.bgStatusBar = QColor("#111720");
        t.bgTabStrip = QColor("#121821");
        t.border = QColor("#263242");
        t.borderControl = QColor("#344358");

        t.textPrimary = QColor("#F1F5F9");
        t.textBody = QColor("#D5DEE9");
        t.textSecondary = QColor("#94A3B8");
        t.textMuted = QColor("#7D8FA6");
        t.textFaint = QColor("#5E7188");
        t.iconNormal = QColor("#9AA8BC");

        t.kbdBg = QColor("#1E2836");
        t.kbdBorder = QColor("#334155");
        t.kbdText = QColor("#94A3B8");
        t.matchBg = QColor("#854D0E");
        t.matchFg = QColor("#FEF08A");
        t.tooltipBg = QColor("#0B0F15");
        t.tooltipFg = QColor("#F1F5F9");
        t.tooltipBorder = QColor("#334155");
        t.danger = QColor("#F04438");
        t.liveDot = baseAccent;
    }
    return t;
}

ThemePalette& mutableTheme() {
    static ThemePalette palette = buildPalette(false, QStringLiteral("emerald"));
    return palette;
}
} // namespace

const QVector<AccentPreset>& accentPresets() {
    static const QVector<AccentPreset> presets = {
        {QStringLiteral("emerald"), QStringLiteral("翡翠绿"), QColor("#0F7B42"), QColor("#22C55E")},
        {QStringLiteral("ocean"),   QStringLiteral("海渊蓝"), QColor("#0969DA"), QColor("#3B82F6")},
        {QStringLiteral("indigo"),  QStringLiteral("星夜靛"), QColor("#4F46E5"), QColor("#818CF8")},
        {QStringLiteral("violet"),  QStringLiteral("暮光紫"), QColor("#7C3AED"), QColor("#A78BFA")},
        {QStringLiteral("amber"),   QStringLiteral("琥珀金"), QColor("#C26D0E"), QColor("#F59E0B")},
        {QStringLiteral("rose"),    QStringLiteral("绯红玫"), QColor("#BE123C"), QColor("#FB7185")},
    };
    return presets;
}

const ThemePalette& currentTheme() {
    return mutableTheme();
}

void setCurrentTheme(bool dark, const QString& accentIdOrHex) {
    mutableTheme() = buildPalette(dark, accentIdOrHex);
}

QJsonObject ThemePalette::toWebPayload() const {
    return {
        {"dark", dark},
        {"accentId", accentId},
        {"accentLabel", accentLabel},
        {"accent", accent.name(QColor::HexRgb)},
        {"accentHover", accentHover.name(QColor::HexRgb)},
        {"accentPressed", accentPressed.name(QColor::HexRgb)},
        {"accentSoft", accentSoft.name(QColor::HexRgb)},
        {"accentSoftHover", accentSoftHover.name(QColor::HexRgb)},
        {"accentBorder", accentBorder.name(QColor::HexRgb)},
        {"accentText", accentText.name(QColor::HexRgb)},
        {"accentRgb", QStringLiteral("%1, %2, %3").arg(accent.red()).arg(accent.green()).arg(accent.blue())},
    };
}

QString applyThemeTokens(const QString& qssTemplate) {
    const auto& t = currentTheme();
    QString out = qssTemplate;
    const QPair<const char*, QString> replacements[] = {
        {"{{accent}}", t.accent.name()},
        {"{{accent_hover}}", t.accentHover.name()},
        {"{{accent_pressed}}", t.accentPressed.name()},
        {"{{accent_soft}}", t.accentSoft.name()},
        {"{{accent_soft_hover}}", t.accentSoftHover.name()},
        {"{{accent_border}}", t.accentBorder.name()},
        {"{{accent_text}}", t.accentText.name()},
        {"{{bg_chrome}}", t.bgChrome.name()},
        {"{{bg_toolbar}}", t.bgToolbar.name()},
        {"{{bg_rail}}", t.bgRail.name()},
        {"{{bg_sidebar}}", t.bgSidebar.name()},
        {"{{bg_surface}}", t.bgSurface.name()},
        {"{{bg_canvas}}", t.bgCanvas.name()},
        {"{{bg_card}}", t.bgCard.name()},
        {"{{bg_input}}", t.bgInput.name()},
        {"{{bg_hover}}", t.bgHover.name()},
        {"{{bg_selected}}", t.bgSelected.name()},
        {"{{bg_statusbar}}", t.bgStatusBar.name()},
        {"{{bg_tabstrip}}", t.bgTabStrip.name()},
        {"{{border}}", t.border.name()},
        {"{{border_control}}", t.borderControl.name()},
        {"{{text_primary}}", t.textPrimary.name()},
        {"{{text_body}}", t.textBody.name()},
        {"{{text_secondary}}", t.textSecondary.name()},
        {"{{text_muted}}", t.textMuted.name()},
        {"{{text_faint}}", t.textFaint.name()},
        {"{{tooltip_bg}}", t.tooltipBg.name()},
        {"{{tooltip_fg}}", t.tooltipFg.name()},
        {"{{tooltip_border}}", t.tooltipBorder.name()},
        {"{{danger}}", t.danger.name()},
        {"{{live_dot}}", t.liveDot.name()},
        {"{{scroll_thumb}}", t.dark ? QStringLiteral("rgba(148, 163, 184, 0.24)") : QStringLiteral("rgba(100, 116, 139, 0.22)")},
        {"{{scroll_thumb_hover}}", t.dark ? QStringLiteral("rgba(148, 163, 184, 0.45)") : QStringLiteral("rgba(100, 116, 139, 0.44)")},
        {"{{close_hover_bg}}", t.dark ? QStringLiteral("rgba(255, 255, 255, 0.12)") : QStringLiteral("rgba(15, 23, 42, 0.09)")},
        {"{{caption_hover}}", t.dark ? QStringLiteral("#232C3B") : QStringLiteral("#DFE4EC")},
        {"{{caption_pressed}}", t.dark ? QStringLiteral("#2D384A") : QStringLiteral("#D2D9E4")},
        {"{{tab_close_icon}}", t.dark ? QStringLiteral(":/window-chrome/close-white.svg") : QStringLiteral(":/window-chrome/tab-close.svg")},
        {"{{btn_on_accent}}", t.dark && t.accent.lightnessF() > 0.62 ? QStringLiteral("#0B1117") : QStringLiteral("#FFFFFF")},
    };
    for (const auto& pair : replacements) {
        out.replace(QLatin1String(pair.first), pair.second);
    }
    return out;
}

QIcon tintedIcon(const QString& resourcePath, const QColor& color, int px) {
    const QIcon raw(resourcePath);
    const QPixmap src = raw.pixmap(px * 2, px * 2);
    if (src.isNull()) return raw;
    QPixmap colored(src.size());
    colored.fill(Qt::transparent);
    QPainter p(&colored);
    p.drawPixmap(0, 0, src);
    p.setCompositionMode(QPainter::CompositionMode_SourceIn);
    p.fillRect(colored.rect(), color);
    p.end();
    QIcon result;
    result.addPixmap(colored);
    return result;
}

QIcon themedXlsxIcon(const QColor& accent, bool dark, int px) {
    const int dim = px * 2;
    QPixmap pm(dim, dim);
    pm.fill(Qt::transparent);
    QPainter p(&pm);
    p.setRenderHint(QPainter::Antialiasing, true);
    const qreal u = dim / 20.0;

    QPainterPath doc;
    doc.moveTo(4.5 * u, 2.5 * u);
    doc.lineTo(11.7 * u, 2.5 * u);
    doc.lineTo(15.5 * u, 6.3 * u);
    doc.lineTo(15.5 * u, 16.5 * u);
    doc.quadTo(15.5 * u, 18.0 * u, 14.0 * u, 18.0 * u);
    doc.lineTo(4.5 * u, 18.0 * u);
    doc.quadTo(3.0 * u, 18.0 * u, 3.0 * u, 16.5 * u);
    doc.lineTo(3.0 * u, 4.0 * u);
    doc.quadTo(3.0 * u, 2.5 * u, 4.5 * u, 2.5 * u);

    const QColor fill = blendColor(dark ? QColor("#151C25") : QColor("#FFFFFF"), accent, dark ? 0.24 : 0.13);
    p.setBrush(fill);
    p.setPen(QPen(accent, 1.35 * u, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin));
    p.drawPath(doc);

    // Folded corner
    p.drawLine(QPointF(11.5 * u, 2.5 * u), QPointF(11.5 * u, 6.3 * u));
    p.drawLine(QPointF(11.5 * u, 6.3 * u), QPointF(15.5 * u, 6.3 * u));

    // Mini grid inside
    const QRectF grid(5.6 * u, 9.0 * u, 8.2 * u, 6.0 * u);
    p.setBrush(dark ? QColor("#111720") : QColor("#FFFFFF"));
    p.setPen(QPen(accent, 1.15 * u));
    p.drawRoundedRect(grid, 1.0 * u, 1.0 * u);
    p.drawLine(QPointF(grid.left(), grid.top() + 2.4 * u), QPointF(grid.right(), grid.top() + 2.4 * u));
    p.drawLine(QPointF(grid.left() + 3.4 * u, grid.top()), QPointF(grid.left() + 3.4 * u, grid.bottom()));
    p.end();

    QIcon icon;
    icon.addPixmap(pm);
    return icon;
}

double scaleFor(const QWidget* widget) {
    if (widget) {
        if (auto* win = widget->window(); win && win->windowHandle() && win->windowHandle()->screen()) {
            return qMax(1.0, win->windowHandle()->screen()->logicalDotsPerInch() / 96.0);
        }
    }
    if (auto* screen = QApplication::primaryScreen()) {
        return qMax(1.0, screen->logicalDotsPerInch() / 96.0);
    }
    return 1.0;
}

int scaled(const QWidget* widget, int px) {
    return qRound(px * scaleFor(widget));
}

bool motionEnabled() {
    BOOL enabled = TRUE;
    if (SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, &enabled, 0)) {
        return enabled != FALSE;
    }
    return true;
}

// ── AnimatedScanBar ──────────────────────────────────────────────────────────

AnimatedScanBar::AnimatedScanBar(QWidget* parent) : QWidget(parent) {
    setFixedHeight(3);
    setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Fixed);
    setAttribute(Qt::WA_TransparentForMouseEvents);

    sweep_ = new QVariantAnimation(this);
    sweep_->setStartValue(0.0);
    sweep_->setEndValue(1.0);
    sweep_->setDuration(1150);
    sweep_->setLoopCount(-1);
    sweep_->setEasingCurve(QEasingCurve::InOutSine);
    connect(sweep_, &QVariantAnimation::valueChanged, this, [this](const QVariant& value) {
        phase_ = value.toReal();
        update();
    });

    fade_ = new QVariantAnimation(this);
    fade_->setDuration(160);
    fade_->setEasingCurve(QEasingCurve::OutCubic);
    connect(fade_, &QVariantAnimation::valueChanged, this, [this](const QVariant& value) {
        opacity_ = value.toReal();
        update();
    });
    connect(fade_, &QVariantAnimation::finished, this, [this] {
        if (!running_ && opacity_ <= 0.01) sweep_->stop();
    });
}

void AnimatedScanBar::setRunning(bool running) {
    if (running_ == running) return;
    running_ = running;
    if (!motionEnabled()) {
        opacity_ = running ? 1.0 : 0.0;
        phase_ = 0.5;
        sweep_->stop();
        update();
        return;
    }
    if (running_) {
        if (sweep_->state() != QAbstractAnimation::Running) sweep_->start();
    }
    fade_->stop();
    fade_->setStartValue(opacity_);
    fade_->setEndValue(running_ ? 1.0 : 0.0);
    fade_->start();
}

void AnimatedScanBar::paintEvent(QPaintEvent*) {
    if (opacity_ <= 0.01 || width() <= 0) return;
    const auto& t = currentTheme();
    QPainter p(this);
    p.setRenderHint(QPainter::Antialiasing, true);
    p.setOpacity(opacity_);

    p.fillRect(rect(), t.accentSoft);

    const qreal barW = qMax<qreal>(44.0, width() * 0.34);
    const qreal x = -barW + phase_ * (width() + barW * 1.1);
    QColor c0 = t.accent; c0.setAlpha(0);
    QColor c1 = t.accent; c1.setAlpha(220);
    QColor c2 = t.accentHover; c2.setAlpha(255);
    QLinearGradient grad(x, 0, x + barW, 0);
    grad.setColorAt(0.0, c0);
    grad.setColorAt(0.35, c1);
    grad.setColorAt(0.65, c2);
    grad.setColorAt(1.0, c0);
    p.setPen(Qt::NoPen);
    p.setBrush(grad);
    p.drawRoundedRect(QRectF(x, 0, barW, height()), 1.5, 1.5);
}

// ── AnimatedActivityRail ─────────────────────────────────────────────────────

AnimatedActivityRail::AnimatedActivityRail(QWidget* parent) : QWidget(parent) {
    setObjectName("workspaceRail");
    layout_ = new QVBoxLayout(this);
    layout_->setContentsMargins(6, 10, 6, 10);
    layout_->setSpacing(6);
    layout_->addStretch(1);

    slideAnim_ = new QVariantAnimation(this);
    slideAnim_->setDuration(210);
    slideAnim_->setEasingCurve(QEasingCurve::OutCubic);
    connect(slideAnim_, &QVariantAnimation::valueChanged, this, [this](const QVariant& value) {
        indicatorY_ = value.toReal();
        update();
    });
}

void AnimatedActivityRail::registerViewButton(int id, QToolButton* button) {
    buttons_.insert(id, button);
    button->setParent(this);
    int tailCount = 1 + (toggleButton_ ? 1 : 0) + (settingsButton_ ? 1 : 0);
    const int insertPos = qMax(0, layout_->count() - tailCount);
    layout_->insertWidget(insertPos, button, 0, Qt::AlignHCenter);
}

void AnimatedActivityRail::setToggleButton(QToolButton* button) {
    toggleButton_ = button;
    button->setParent(this);
    const int insertPos = settingsButton_ ? qMax(0, layout_->count() - 1) : layout_->count();
    layout_->insertWidget(insertPos, button, 0, Qt::AlignHCenter);
}

void AnimatedActivityRail::setSettingsButton(QToolButton* button) {
    settingsButton_ = button;
    button->setParent(this);
    layout_->addWidget(button, 0, Qt::AlignHCenter);
}

void AnimatedActivityRail::setActiveId(int id, bool animate) {
    activeId_ = id;
    const qreal target = targetYFor(id);
    if (target < 0) {
        update();
        return;
    }
    if (!animate || !motionEnabled() || indicatorY_ < 0.0 || !isVisible()) {
        slideAnim_->stop();
        indicatorY_ = target;
        update();
        return;
    }
    slideAnim_->stop();
    slideAnim_->setStartValue(indicatorY_);
    slideAnim_->setEndValue(target);
    slideAnim_->start();
}

void AnimatedActivityRail::updateScale() {
    const double s = scaleFor(this);
    const int pad = qRound(6 * s);
    layout_->setContentsMargins(pad, qRound(10 * s), pad, qRound(10 * s));
    layout_->setSpacing(qRound(6 * s));
    setFixedWidth(qRound(52 * s));
    const QSize iconSz(qRound(20 * s), qRound(20 * s));
    for (auto* btn : buttons_) btn->setIconSize(iconSz);
    if (toggleButton_) toggleButton_->setIconSize(QSize(qRound(18 * s), qRound(18 * s)));
    if (settingsButton_) settingsButton_->setIconSize(QSize(qRound(18 * s), qRound(18 * s)));
    indicatorY_ = targetYFor(activeId_);
    update();
}

void AnimatedActivityRail::applyTheme() {
    const auto& t = currentTheme();
    auto setNavIcon = [&](int id, const QString& svg) {
        if (auto* btn = buttons_.value(id, nullptr)) {
            QIcon icon;
            const QPixmap offPm = tintedIcon(svg, t.iconNormal, 24).pixmap(48, 48);
            const QPixmap onPm = tintedIcon(svg, t.accent, 24).pixmap(48, 48);
            icon.addPixmap(offPm, QIcon::Normal, QIcon::Off);
            icon.addPixmap(onPm, QIcon::Normal, QIcon::On);
            btn->setIcon(icon);
        }
    };
    setNavIcon(0, QStringLiteral(":/window-chrome/files.svg"));
    setNavIcon(1, QStringLiteral(":/window-chrome/search.svg"));
    if (toggleButton_) toggleButton_->setIcon(tintedIcon(QStringLiteral(":/window-chrome/sidebar-toggle.svg"), t.iconNormal, 22));
    if (settingsButton_) settingsButton_->setIcon(tintedIcon(QStringLiteral(":/window-chrome/settings.svg"), t.iconNormal, 22));
    update();
}

qreal AnimatedActivityRail::targetYFor(int id) const {
    auto* btn = buttons_.value(id, nullptr);
    if (!btn || btn->height() <= 0) return -1.0;
    return btn->geometry().center().y();
}

void AnimatedActivityRail::resizeEvent(QResizeEvent* event) {
    QWidget::resizeEvent(event);
    if (slideAnim_->state() != QAbstractAnimation::Running) {
        indicatorY_ = targetYFor(activeId_);
    }
}

void AnimatedActivityRail::paintEvent(QPaintEvent*) {
    const auto& t = currentTheme();
    QPainter p(this);
    p.setRenderHint(QPainter::Antialiasing, true);
    p.fillRect(rect(), t.bgRail);
    p.setPen(t.border);
    p.drawLine(width() - 1, 0, width() - 1, height());

    qreal cy = indicatorY_;
    if (cy < 0.0) cy = targetYFor(activeId_);
    if (cy >= 0.0) {
        const double s = scaleFor(this);
        const qreal pillW = 3.0 * s;
        const qreal pillH = 20.0 * s;
        const QRectF pill(1.0 * s, cy - pillH / 2.0, pillW, pillH);
        p.setPen(Qt::NoPen);
        p.setBrush(t.accent);
        p.drawRoundedRect(pill, pillW / 2.0, pillW / 2.0);
    }
}

// ── AnimatedSidebarStack ─────────────────────────────────────────────────────

class AnimatedSidebarStack::TransitionOverlay final : public QWidget {
public:
    explicit TransitionOverlay(QWidget* parent) : QWidget(parent) {
        setAttribute(Qt::WA_TransparentForMouseEvents);
        hide();
    }
    QPixmap fromPix;
    QPixmap toPix;
    qreal progress = 1.0;
    int direction = 1;

protected:
    void paintEvent(QPaintEvent*) override {
        QPainter p(this);
        p.fillRect(rect(), currentTheme().bgSidebar);
        const qreal shift = 10.0 * scaleFor(this);
        if (!fromPix.isNull()) {
            p.save();
            p.setOpacity(qBound(0.0, 1.0 - progress * 1.25, 1.0));
            p.drawPixmap(QPointF(-direction * shift * progress, 0), fromPix);
            p.restore();
        }
        if (!toPix.isNull()) {
            p.save();
            p.setOpacity(qBound(0.0, progress, 1.0));
            p.drawPixmap(QPointF(direction * shift * (1.0 - progress), 0), toPix);
            p.restore();
        }
    }
};

AnimatedSidebarStack::AnimatedSidebarStack(QWidget* parent) : QStackedWidget(parent) {
    overlay_ = new TransitionOverlay(this);
    anim_ = new QVariantAnimation(this);
    anim_->setDuration(175);
    anim_->setEasingCurve(QEasingCurve::OutCubic);
    connect(anim_, &QVariantAnimation::valueChanged, this, [this](const QVariant& value) {
        overlay_->progress = value.toReal();
        overlay_->update();
    });
    connect(anim_, &QVariantAnimation::finished, this, [this] {
        overlay_->hide();
        overlay_->fromPix = QPixmap();
        overlay_->toPix = QPixmap();
    });
}

void AnimatedSidebarStack::animateToIndex(int index) {
    if (index == currentIndex() || index < 0 || index >= count()) return;
    if (!motionEnabled() || !isVisible() || width() <= 0 || height() <= 0) {
        setCurrentIndex(index);
        return;
    }
    const int prevIndex = currentIndex();
    QWidget* fromWidget = currentWidget();
    QWidget* toWidget = widget(index);
    if (!fromWidget || !toWidget) {
        setCurrentIndex(index);
        return;
    }
    overlay_->hide();
    const QPixmap fromPix = fromWidget->grab();
    setCurrentIndex(index);
    toWidget->setGeometry(rect());
    const QPixmap toPix = toWidget->grab();

    overlay_->fromPix = fromPix;
    overlay_->toPix = toPix;
    overlay_->direction = index > prevIndex ? 1 : -1;
    overlay_->progress = 0.0;
    overlay_->setGeometry(rect());
    overlay_->raise();
    overlay_->show();

    anim_->stop();
    anim_->setStartValue(0.0);
    anim_->setEndValue(1.0);
    anim_->start();
}

// ── CommandSearchPill ────────────────────────────────────────────────────────

CommandSearchPill::CommandSearchPill(QWidget* parent)
    : QPushButton(parent),
      placeholder_(QStringLiteral("快速打开工作簿…")),
      shortcutHint_(QStringLiteral("Ctrl+Shift+O")) {
    setObjectName("quickOpenButton");
    setCursor(Qt::PointingHandCursor);
    setFlat(true);
    setSizePolicy(QSizePolicy::Preferred, QSizePolicy::Fixed);
    applyTheme();

    hoverAnim_ = new QVariantAnimation(this);
    hoverAnim_->setDuration(150);
    hoverAnim_->setEasingCurve(QEasingCurve::OutCubic);
    connect(hoverAnim_, &QVariantAnimation::valueChanged, this, [this](const QVariant& v) {
        hover_ = v.toReal();
        update();
    });
}

void CommandSearchPill::setPlaceholder(const QString& text) {
    placeholder_ = text;
    update();
}

void CommandSearchPill::setShortcutHint(const QString& hint) {
    shortcutHint_ = hint;
    update();
}

void CommandSearchPill::applyTheme() {
    searchIcon_ = tintedIcon(QStringLiteral(":/window-chrome/search.svg"), currentTheme().iconNormal, 18);
    update();
}

QSize CommandSearchPill::sizeHint() const {
    const double s = scaleFor(this);
    return QSize(qRound(340 * s), qRound(32 * s));
}

void CommandSearchPill::enterEvent(QEvent* event) {
    QPushButton::enterEvent(event);
    if (!isEnabled()) return;
    if (!motionEnabled()) { hover_ = 1.0; update(); return; }
    hoverAnim_->stop();
    hoverAnim_->setStartValue(hover_);
    hoverAnim_->setEndValue(1.0);
    hoverAnim_->start();
}

void CommandSearchPill::leaveEvent(QEvent* event) {
    QPushButton::leaveEvent(event);
    if (!motionEnabled()) { hover_ = 0.0; update(); return; }
    hoverAnim_->stop();
    hoverAnim_->setStartValue(hover_);
    hoverAnim_->setEndValue(0.0);
    hoverAnim_->start();
}

void CommandSearchPill::paintEvent(QPaintEvent*) {
    const auto& t = currentTheme();
    QPainter p(this);
    p.setRenderHint(QPainter::Antialiasing, true);
    const double s = scaleFor(this);
    const qreal h = isEnabled() ? hover_ : 0.0;
    const bool pressed = isDown() && isEnabled();
    const bool focused = hasFocus() && isEnabled();

    const QRectF outer = QRectF(rect()).adjusted(1.0, 1.0, -1.0, -1.0);
    const qreal radius = 8.0 * s;

    if (h > 0.02 || focused) {
        QColor glow = t.accent;
        glow.setAlpha(qRound(focused ? 44.0 : 30.0 * h));
        p.setPen(Qt::NoPen);
        p.setBrush(glow);
        p.drawRoundedRect(outer.adjusted(-1.0, -1.0, 1.0, 1.0), radius + 1.0, radius + 1.0);
    }

    const QColor baseBg = t.dark ? QColor("#111720") : QColor("#F4F6F9");
    const QColor hoverBg = t.dark ? QColor("#1A2230") : QColor("#FFFFFF");
    QColor bg = !isEnabled()
        ? t.bgStatusBar
        : pressed
            ? t.accentSoft
            : blendColor(baseBg, hoverBg, h);
    QColor border = !isEnabled()
        ? t.border
        : (focused || pressed)
            ? t.accent
            : blendColor(t.borderControl, t.accentBorder, h);

    p.setPen(QPen(border, 1.0));
    p.setBrush(bg);
    p.drawRoundedRect(outer, radius, radius);

    const int iconDim = qRound(15 * s);
    const QRect iconRect(qRound(11 * s), qRound((height() - iconDim) / 2.0), iconDim, iconDim);
    p.save();
    p.setOpacity(isEnabled() ? (0.7 + 0.3 * h) : 0.35);
    searchIcon_.paint(&p, iconRect);
    p.restore();

    QFont kbdFont = font();
    kbdFont.setFamily(QStringLiteral("Segoe UI"));
    kbdFont.setPixelSize(qRound(11 * s));
    kbdFont.setWeight(QFont::Medium);
    const QFontMetrics kfm(kbdFont);
    const qreal kbdPadX = 7.0 * s;
    const qreal kbdW = kfm.horizontalAdvance(shortcutHint_) + kbdPadX * 2.0;
    const qreal kbdH = qMin<qreal>(height() - 10.0 * s, kfm.height() + 4.0 * s);
    const QRectF kbdRect(width() - kbdW - 7.0 * s, (height() - kbdH) / 2.0, kbdW, kbdH);
    drawKeycap(&p, kbdRect, shortcutHint_, kbdFont,
               blendColor(t.kbdBg, t.accentSoft, h),
               blendColor(t.kbdBorder, t.accentBorder, h),
               isEnabled() ? blendColor(t.kbdText, t.accentText, h) : t.textFaint,
               4.5 * s);

    QFont textFont = font();
    textFont.setPixelSize(qRound(12.5 * s));
    p.setFont(textFont);
    p.setPen(!isEnabled() ? t.textFaint : blendColor(t.textMuted, t.textPrimary, h));
    const int textLeft = iconRect.right() + qRound(8 * s);
    const int textAvail = qMax(0, qFloor(kbdRect.left()) - textLeft - qRound(8 * s));
    const QFontMetrics tfm(textFont);
    p.drawText(QRect(textLeft, 0, textAvail, height()), Qt::AlignLeft | Qt::AlignVCenter,
               tfm.elidedText(placeholder_, Qt::ElideRight, textAvail));
}

// ── CollapsiblePanel ─────────────────────────────────────────────────────────

CollapsiblePanel::CollapsiblePanel(QWidget* content, QWidget* parent)
    : QWidget(parent), content_(content) {
    auto* lay = new QVBoxLayout(this);
    lay->setContentsMargins(0, 0, 0, 0);
    lay->setSpacing(0);
    lay->addWidget(content_);
    setMaximumHeight(0);
    hide();

    heightAnim_ = new QVariantAnimation(this);
    heightAnim_->setDuration(190);
    heightAnim_->setEasingCurve(QEasingCurve::OutCubic);
    connect(heightAnim_, &QVariantAnimation::valueChanged, this, [this](const QVariant& value) {
        setMaximumHeight(value.toInt());
    });
    connect(heightAnim_, &QVariantAnimation::finished, this, [this] {
        if (expanded_) setMaximumHeight(QWIDGETSIZE_MAX);
        else hide();
    });
}

void CollapsiblePanel::setExpanded(bool expanded, bool animate) {
    if (expanded_ == expanded && ((expanded && isVisible()) || (!expanded && !isVisible()))) return;
    expanded_ = expanded;
    if (!animate || !motionEnabled()) {
        heightAnim_->stop();
        if (expanded_) {
            setMaximumHeight(QWIDGETSIZE_MAX);
            show();
        } else {
            setMaximumHeight(0);
            hide();
        }
        return;
    }
    if (expanded_) {
        show();
        content_->ensurePolished();
        if (auto* lay = content_->layout()) lay->activate();
        const int targetH = qMax(content_->sizeHint().height(), content_->minimumSizeHint().height()) + 8;
        heightAnim_->stop();
        heightAnim_->setStartValue(height());
        heightAnim_->setEndValue(targetH);
        heightAnim_->start();
    } else {
        heightAnim_->stop();
        heightAnim_->setStartValue(height());
        heightAnim_->setEndValue(0);
        heightAnim_->start();
    }
}

// ── WelcomeActionCard ────────────────────────────────────────────────────────

WelcomeActionCard::WelcomeActionCard(const QString& iconPath, const QString& title,
                                     const QString& subtitle, const QString& shortcut,
                                     bool accentIcon, QWidget* parent)
    : QPushButton(parent),
      iconPath_(iconPath),
      accentIcon_(accentIcon),
      title_(title),
      subtitle_(subtitle),
      shortcut_(shortcut) {
    setCursor(Qt::PointingHandCursor);
    setFlat(true);
    setAccessibleName(title);
    setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Fixed);
    applyTheme();

    hoverAnim_ = new QVariantAnimation(this);
    hoverAnim_->setDuration(160);
    hoverAnim_->setEasingCurve(QEasingCurve::OutCubic);
    connect(hoverAnim_, &QVariantAnimation::valueChanged, this, [this](const QVariant& v) {
        hover_ = v.toReal();
        update();
    });
}

void WelcomeActionCard::applyTheme() {
    const auto& t = currentTheme();
    icon_ = tintedIcon(iconPath_, accentIcon_ ? t.accent : t.iconNormal, 22);
    update();
}

QSize WelcomeActionCard::sizeHint() const {
    const double s = scaleFor(this);
    return QSize(qRound(312 * s), qRound(80 * s));
}

void WelcomeActionCard::enterEvent(QEvent* event) {
    QPushButton::enterEvent(event);
    if (!motionEnabled()) { hover_ = 1.0; update(); return; }
    hoverAnim_->stop();
    hoverAnim_->setStartValue(hover_);
    hoverAnim_->setEndValue(1.0);
    hoverAnim_->start();
}

void WelcomeActionCard::leaveEvent(QEvent* event) {
    QPushButton::leaveEvent(event);
    if (!motionEnabled()) { hover_ = 0.0; update(); return; }
    hoverAnim_->stop();
    hoverAnim_->setStartValue(hover_);
    hoverAnim_->setEndValue(0.0);
    hoverAnim_->start();
}

void WelcomeActionCard::paintEvent(QPaintEvent*) {
    const auto& t = currentTheme();
    QPainter p(this);
    p.setRenderHint(QPainter::Antialiasing, true);
    const double s = scaleFor(this);
    const qreal h = isEnabled() ? hover_ : 0.0;
    const bool pressed = isDown() && isEnabled();
    const qreal lift = pressed ? 0.5 * s : -1.5 * s * h;

    const QRectF cardRect = QRectF(rect()).adjusted(2.0 * s, 3.0 * s + lift, -2.0 * s, -3.0 * s + lift);
    const qreal radius = 10.0 * s;

    p.setPen(Qt::NoPen);
    p.setBrush(QColor(0, 0, 0, qRound((t.dark ? 36 : 8) + (t.dark ? 24 : 14) * h)));
    p.drawRoundedRect(cardRect.translated(0, (1.5 + 1.5 * h) * s), radius, radius);

    const QColor bg = pressed ? t.accentSoft : blendColor(t.bgCard, t.dark ? QColor("#212C3B") : QColor("#FFFFFF"), h);
    const QColor border = (hasFocus() || pressed)
        ? t.accent
        : blendColor(t.border, t.accentBorder, h);
    p.setPen(QPen(border, 1.0));
    p.setBrush(bg);
    p.drawRoundedRect(cardRect, radius, radius);

    const qreal badgeDim = 36.0 * s;
    const QRectF badgeRect(cardRect.left() + 14.0 * s, cardRect.center().y() - badgeDim / 2.0, badgeDim, badgeDim);
    p.setPen(Qt::NoPen);
    p.setBrush(blendColor(t.bgHover, t.accentSoft, accentIcon_ ? qMax(0.65, h) : h));
    p.drawRoundedRect(badgeRect, 8.0 * s, 8.0 * s);

    const int iconDim = qRound(18 * s);
    const QRect iconRect(qRound(badgeRect.center().x() - iconDim / 2.0),
                         qRound(badgeRect.center().y() - iconDim / 2.0), iconDim, iconDim);
    icon_.paint(&p, iconRect);

    const qreal textLeft = badgeRect.right() + 12.0 * s;
    qreal titleRight = cardRect.right() - 12.0 * s;

    if (!shortcut_.isEmpty()) {
        QFont kbdFont = font();
        kbdFont.setFamily(QStringLiteral("Segoe UI"));
        kbdFont.setPixelSize(qRound(10.5 * s));
        kbdFont.setWeight(QFont::Medium);
        const QFontMetrics kfm(kbdFont);
        const qreal kw = kfm.horizontalAdvance(shortcut_) + 12.0 * s;
        const qreal kh = kfm.height() + 4.0 * s;
        const QRectF kbdRect(cardRect.right() - kw - 12.0 * s, cardRect.top() + 14.0 * s, kw, kh);
        drawKeycap(&p, kbdRect, shortcut_, kbdFont,
                   blendColor(t.kbdBg, t.accentSoft, h),
                   blendColor(t.kbdBorder, t.accentBorder, h),
                   blendColor(t.kbdText, t.accentText, h),
                   4.5 * s);
        titleRight = kbdRect.left() - 8.0 * s;
    }

    QFont titleFont = font();
    titleFont.setPixelSize(qRound(13.5 * s));
    titleFont.setWeight(QFont::DemiBold);
    const QFontMetrics tfm(titleFont);
    p.setFont(titleFont);
    p.setPen(blendColor(t.textPrimary, t.accentText, h));
    const qreal titleAvail = qMax<qreal>(0, titleRight - textLeft);
    p.drawText(QRectF(textLeft, cardRect.top() + 14.0 * s, titleAvail, tfm.height() + 2),
               Qt::AlignLeft | Qt::AlignVCenter,
               tfm.elidedText(title_, Qt::ElideRight, qFloor(titleAvail)));

    QFont subFont = font();
    subFont.setPixelSize(qRound(11.5 * s));
    const QFontMetrics sfm(subFont);
    p.setFont(subFont);
    p.setPen(t.textMuted);
    const qreal subAvail = qMax<qreal>(0, cardRect.right() - 12.0 * s - textLeft);
    p.drawText(QRectF(textLeft, cardRect.top() + 36.0 * s, subAvail, sfm.height() + 2),
               Qt::AlignLeft | Qt::AlignVCenter,
               sfm.elidedText(subtitle_, Qt::ElideRight, qFloor(subAvail)));
}

// ── WorkspaceWelcomeWidget ───────────────────────────────────────────────────

WorkspaceWelcomeWidget::WorkspaceWelcomeWidget(Callbacks callbacks, QWidget* parent)
    : QWidget(parent), callbacks_(std::move(callbacks)) {
    setObjectName("workspaceWelcome");
    const double s = scaleFor(this);
    auto* outer = new QVBoxLayout(this);
    outer->setContentsMargins(qRound(32 * s), qRound(24 * s), qRound(32 * s), qRound(24 * s));
    outer->setSpacing(0);
    outer->addStretch(1);

    auto* centerWrap = new QWidget(this);
    centerWrap->setMaximumWidth(qRound(680 * s));
    auto* center = new QVBoxLayout(centerWrap);
    center->setContentsMargins(0, 0, 0, 0);
    center->setSpacing(0);
    center->setAlignment(Qt::AlignHCenter);

    auto* logoBadge = new QLabel(centerWrap);
    logoBadge->setObjectName("welcomeLogoBadge");
    logoBadge->setFixedSize(qRound(64 * s), qRound(64 * s));
    logoBadge->setAlignment(Qt::AlignCenter);
    const int logoDim = qRound(38 * s);
    const QPixmap logo = QIcon(":/brand/excel-utils.ico").pixmap(logoDim, logoDim);
    if (!logo.isNull()) {
        logoBadge->setPixmap(logo.scaled(logoDim, logoDim, Qt::KeepAspectRatio, Qt::SmoothTransformation));
    }
    center->addWidget(logoBadge, 0, Qt::AlignHCenter);
    center->addSpacing(qRound(16 * s));

    titleLabel_ = new QLabel(centerWrap);
    titleLabel_->setObjectName("welcomeTitle");
    titleLabel_->setAlignment(Qt::AlignCenter);
    titleLabel_->setWordWrap(true);
    center->addWidget(titleLabel_);
    center->addSpacing(qRound(6 * s));

    subtitleLabel_ = new QLabel(centerWrap);
    subtitleLabel_->setObjectName("welcomeSubtitle");
    subtitleLabel_->setAlignment(Qt::AlignCenter);
    subtitleLabel_->setWordWrap(true);
    center->addWidget(subtitleLabel_);
    center->addSpacing(qRound(12 * s));

    pathButton_ = new QPushButton(centerWrap);
    pathButton_->setObjectName("welcomePathChip");
    pathButton_->setCursor(Qt::PointingHandCursor);
    pathButton_->setToolTip(QStringLiteral("在文件资源管理器中打开此文件夹"));
    connect(pathButton_, &QPushButton::clicked, this, [this] {
        if (callbacks_.revealFolder) callbacks_.revealFolder();
    });
    center->addWidget(pathButton_, 0, Qt::AlignHCenter);
    center->addSpacing(qRound(26 * s));

    actionsGridWrap_ = new QWidget(centerWrap);
    auto* grid = new QGridLayout(actionsGridWrap_);
    grid->setContentsMargins(0, 0, 0, 0);
    grid->setHorizontalSpacing(qRound(14 * s));
    grid->setVerticalSpacing(qRound(12 * s));

    auto* cardQuick = new WelcomeActionCard(
        ":/window-chrome/search.svg",
        QStringLiteral("快速打开工作簿"),
        QStringLiteral("按文件名或路径片段秒速切换"),
        QStringLiteral("Ctrl+Shift+O"), true, actionsGridWrap_);
    cardQuick->setMinimumSize(qRound(306 * s), qRound(78 * s));
    connect(cardQuick, &QPushButton::clicked, this, [this] {
        if (callbacks_.quickOpen) callbacks_.quickOpen();
    });

    auto* cardSearch = new WelcomeActionCard(
        ":/window-chrome/search.svg",
        QStringLiteral("搜索单元格内容"),
        QStringLiteral("跨表检索文字、数值与公式"),
        QStringLiteral("Ctrl+Shift+F"), false, actionsGridWrap_);
    cardSearch->setMinimumSize(qRound(306 * s), qRound(78 * s));
    connect(cardSearch, &QPushButton::clicked, this, [this] {
        if (callbacks_.openSearch) callbacks_.openSearch();
    });

    auto* cardNew = new WelcomeActionCard(
        ":/window-chrome/new-file.svg",
        QStringLiteral("新建空白工作簿"),
        QStringLiteral("在当前目录快速创建 .xlsx"),
        QStringLiteral("新建"), false, actionsGridWrap_);
    cardNew->setMinimumSize(qRound(306 * s), qRound(78 * s));
    connect(cardNew, &QPushButton::clicked, this, [this] {
        if (callbacks_.newWorkbook) callbacks_.newWorkbook();
    });

    auto* cardTools = new WelcomeActionCard(
        ":/window-chrome/tools.svg",
        QStringLiteral("财务与数据工具"),
        QStringLiteral("同表头合并、按列拆表与查重"),
        QStringLiteral("9 项"), true, actionsGridWrap_);
    cardTools->setMinimumSize(qRound(306 * s), qRound(78 * s));
    connect(cardTools, &QPushButton::clicked, this, [this] {
        if (callbacks_.openTools) callbacks_.openTools();
    });

    cards_ = {cardQuick, cardSearch, cardNew, cardTools};
    grid->addWidget(cardQuick, 0, 0);
    grid->addWidget(cardSearch, 0, 1);
    grid->addWidget(cardNew, 1, 0);
    grid->addWidget(cardTools, 1, 1);
    center->addWidget(actionsGridWrap_);

    emptyActionsWrap_ = new QWidget(centerWrap);
    auto* emptyLay = new QVBoxLayout(emptyActionsWrap_);
    emptyLay->setContentsMargins(0, 0, 0, 0);
    emptyLay->setSpacing(14);
    emptyLay->setAlignment(Qt::AlignHCenter);

    openFolderBtn_ = new QPushButton(QIcon(":/window-chrome/folder-open.svg"),
                                     QStringLiteral("选择工作区文件夹…"), emptyActionsWrap_);
    openFolderBtn_->setObjectName("welcomePrimaryCta");
    openFolderBtn_->setCursor(Qt::PointingHandCursor);
    connect(openFolderBtn_, &QPushButton::clicked, this, [this] {
        if (callbacks_.openFolder) callbacks_.openFolder();
    });
    emptyLay->addWidget(openFolderBtn_, 0, Qt::AlignHCenter);

    recentWrap_ = new QWidget(emptyActionsWrap_);
    recentLayout_ = new QHBoxLayout(recentWrap_);
    recentLayout_->setContentsMargins(0, 0, 0, 0);
    recentLayout_->setSpacing(8);
    recentLayout_->setAlignment(Qt::AlignCenter);
    emptyLay->addWidget(recentWrap_, 0, Qt::AlignHCenter);
    center->addWidget(emptyActionsWrap_);

    outer->addWidget(centerWrap, 0, Qt::AlignHCenter);
    outer->addStretch(1);
}

void WorkspaceWelcomeWidget::applyTheme() {
    for (auto* card : cards_) card->applyTheme();
    update();
}

void WorkspaceWelcomeWidget::setWorkspaceState(const QString& root, bool valid, const QStringList& recent) {
    root_ = root;
    valid_ = valid;
    if (valid) {
        const QString folderName = QDir(root).dirName().isEmpty() ? root : QDir(root).dirName();
        titleLabel_->setText(QStringLiteral("%1 · 准备就绪").arg(folderName));
        subtitleLabel_->setText(QStringLiteral("从左侧目录点击工作簿开始编辑，或使用下方快捷入口"));
        const QString nativePath = QDir::toNativeSeparators(root);
        const QFontMetrics pfm(pathButton_->font());
        pathButton_->setText(pfm.elidedText(nativePath, Qt::ElideMiddle, scaled(this, 460)));
        pathButton_->setToolTip(QStringLiteral("在文件资源管理器中打开：%1").arg(nativePath));
        pathButton_->show();
        actionsGridWrap_->show();
        emptyActionsWrap_->hide();
    } else {
        titleLabel_->setText(root.isEmpty()
            ? QStringLiteral("打开本地文件夹，开启工作区")
            : QStringLiteral("工作区文件夹暂时无法访问"));
        subtitleLabel_->setText(root.isEmpty()
            ? QStringLiteral("同屏管理多份表格、全文检索单元格并随时调用财务工具")
            : QStringLiteral("原目录可能已移动或重命名，请重新选择工作区文件夹"));
        pathButton_->hide();
        actionsGridWrap_->hide();
        emptyActionsWrap_->show();

        while (auto* item = recentLayout_->takeAt(0)) {
            if (auto* w = item->widget()) w->deleteLater();
            delete item;
        }
        int shown = 0;
        for (const auto& candidate : recent) {
            if (candidate.compare(root, Qt::CaseInsensitive) == 0 || !QFileInfo(candidate).isDir()) continue;
            auto* chip = new QPushButton(QFileInfo(candidate).fileName().isEmpty() ? candidate : QFileInfo(candidate).fileName(), recentWrap_);
            chip->setObjectName("welcomeRecentChip");
            chip->setCursor(Qt::PointingHandCursor);
            chip->setToolTip(QDir::toNativeSeparators(candidate));
            connect(chip, &QPushButton::clicked, this, [this, candidate] {
                if (callbacks_.openRecentWorkspace) callbacks_.openRecentWorkspace(candidate);
            });
            recentLayout_->addWidget(chip);
            if (++shown >= 4) break;
        }
        recentWrap_->setVisible(shown > 0);
    }
}

void WorkspaceWelcomeWidget::paintEvent(QPaintEvent*) {
    const auto& t = currentTheme();
    QPainter p(this);
    p.fillRect(rect(), t.bgCanvas);

    const double s = scaleFor(this);
    const int step = qMax(18, qRound(22 * s));
    p.setPen(Qt::NoPen);
    p.setBrush(t.bgCanvasDot);
    const qreal dotR = 1.0 * s;
    for (int y = step / 2; y < height(); y += step) {
        for (int x = step / 2; x < width(); x += step) {
            p.drawEllipse(QPointF(x, y), dotR, dotR);
        }
    }
}

// ── WorkspaceFilterProxy ─────────────────────────────────────────────────────

WorkspaceFilterProxy::WorkspaceFilterProxy(QObject* parent) : QSortFilterProxyModel(parent) {
    setDynamicSortFilter(true);
    setRecursiveFilteringEnabled(false);
}

void WorkspaceFilterProxy::setRootDirectory(const QString& rootPath) {
    rootPath_ = rootPath;
    dirMatchCache_.clear();
    invalidateFilter();
}

void WorkspaceFilterProxy::setFilterQuery(const QString& query) {
    const QString trimmed = query.trimmed();
    if (trimmed == query_) return;
    query_ = trimmed;
    dirMatchCache_.clear();
    invalidateFilter();
}

bool WorkspaceFilterProxy::directoryHasMatch(const QString& dirPath, int depth) const {
    if (depth > 4) return false;
    auto it = dirMatchCache_.constFind(dirPath);
    if (it != dirMatchCache_.cend()) return it.value();

    bool found = false;
    QDir dir(dirPath);
    const auto entries = dir.entryInfoList(QDir::AllDirs | QDir::Files | QDir::NoDotAndDotDot);
    for (const auto& entry : entries) {
        const QString name = entry.fileName();
        if (entry.isFile()) {
            if (!name.startsWith("~$") && name.endsWith(".xlsx", Qt::CaseInsensitive) &&
                name.contains(query_, Qt::CaseInsensitive)) {
                found = true;
                break;
            }
        } else if (entry.isDir()) {
            if (name.contains(query_, Qt::CaseInsensitive) || directoryHasMatch(entry.absoluteFilePath(), depth + 1)) {
                found = true;
                break;
            }
        }
    }
    dirMatchCache_.insert(dirPath, found);
    return found;
}

bool WorkspaceFilterProxy::filterAcceptsRow(int sourceRow, const QModelIndex& sourceParent) const {
    auto* fsModel = qobject_cast<QFileSystemModel*>(sourceModel());
    if (!fsModel) return true;
    const QModelIndex idx = fsModel->index(sourceRow, 0, sourceParent);
    const QFileInfo info = fsModel->fileInfo(idx);
    const QString name = info.fileName();
    if (name.startsWith("~$")) return false;
    if (query_.isEmpty()) return true;

    if (!rootPath_.isEmpty()) {
        const QString candidate = QDir::cleanPath(info.absoluteFilePath());
        const QString rootClean = QDir::cleanPath(rootPath_);
        if (rootClean.startsWith(candidate, Qt::CaseInsensitive)) return true;
    }

    if (info.isDir()) {
        return name.contains(query_, Qt::CaseInsensitive) || directoryHasMatch(info.absoluteFilePath(), 0);
    }
    return name.contains(query_, Qt::CaseInsensitive);
}

bool WorkspaceFilterProxy::lessThan(const QModelIndex& left, const QModelIndex& right) const {
    auto* fsModel = qobject_cast<QFileSystemModel*>(sourceModel());
    if (!fsModel) return QSortFilterProxyModel::lessThan(left, right);
    const bool leftDir = fsModel->isDir(left);
    const bool rightDir = fsModel->isDir(right);
    if (leftDir != rightDir) return leftDir;
    static const QCollator natural = [] {
        QCollator c;
        c.setNumericMode(true);
        c.setCaseSensitivity(Qt::CaseInsensitive);
        return c;
    }();
    return natural.compare(fsModel->fileName(left), fsModel->fileName(right)) < 0;
}

// ── WorkspaceTreeView ────────────────────────────────────────────────────────

WorkspaceTreeView::WorkspaceTreeView(QWidget* parent)
    : QTreeView(parent),
      folderIcon_(":/window-chrome/folder.svg"),
      folderOpenIcon_(":/window-chrome/folder-open.svg") {
    setObjectName("workspaceFiles");
    setHeaderHidden(true);
    setEditTriggers(QAbstractItemView::NoEditTriggers);
    setMouseTracking(true);
    setRootIsDecorated(false);
    setUniformRowHeights(true);
    setAnimated(true);
    setVerticalScrollMode(QAbstractItemView::ScrollPerPixel);
    setFrameShape(QFrame::NoFrame);
    setFocusPolicy(Qt::StrongFocus);
    applyTheme();

    hoverAnim_ = new QVariantAnimation(this);
    hoverAnim_->setDuration(110);
    hoverAnim_->setEasingCurve(QEasingCurve::OutCubic);
    connect(hoverAnim_, &QVariantAnimation::valueChanged, this, [this](const QVariant& value) {
        hoverOpacity_ = value.toReal();
        viewport()->update();
    });
}

void WorkspaceTreeView::applyTheme() {
    const auto& t = currentTheme();
    chevronRight_ = tintedIcon(QStringLiteral(":/window-chrome/chevron-right.svg"), t.textMuted, 16);
    chevronDown_ = tintedIcon(QStringLiteral(":/window-chrome/chevron-down.svg"), t.textMuted, 16);
    xlsxIcon_ = themedXlsxIcon(t.accent, t.dark, 20);
    viewport()->update();
}

void WorkspaceTreeView::setOpenBooks(const QSet<QString>& openCanonicalPaths, const QString& activeCanonicalPath) {
    openPaths_ = openCanonicalPaths;
    activePath_ = activeCanonicalPath;
    viewport()->update();
}

bool WorkspaceTreeView::isOpenBook(const QString& canonicalPath) const {
    return openPaths_.contains(canonicalPath.toCaseFolded());
}

bool WorkspaceTreeView::isActiveBook(const QString& canonicalPath) const {
    return !activePath_.isEmpty() && activePath_.compare(canonicalPath, Qt::CaseInsensitive) == 0;
}

QString WorkspaceTreeView::filePathFor(const QModelIndex& index) const {
    if (!index.isValid()) return {};
    if (auto* proxy = qobject_cast<const QSortFilterProxyModel*>(model())) {
        if (auto* fs = qobject_cast<const QFileSystemModel*>(proxy->sourceModel())) {
            const auto info = fs->fileInfo(proxy->mapToSource(index));
            const auto canon = info.canonicalFilePath();
            return canon.isEmpty() ? info.absoluteFilePath() : canon;
        }
    } else if (auto* fs = qobject_cast<const QFileSystemModel*>(model())) {
        const auto info = fs->fileInfo(index);
        const auto canon = info.canonicalFilePath();
        return canon.isEmpty() ? info.absoluteFilePath() : canon;
    }
    return {};
}

bool WorkspaceTreeView::isDirFor(const QModelIndex& index) const {
    if (!index.isValid()) return false;
    if (auto* proxy = qobject_cast<const QSortFilterProxyModel*>(model())) {
        if (auto* fs = qobject_cast<const QFileSystemModel*>(proxy->sourceModel())) {
            return fs->isDir(proxy->mapToSource(index));
        }
    } else if (auto* fs = qobject_cast<const QFileSystemModel*>(model())) {
        return fs->isDir(index);
    }
    return false;
}

void WorkspaceTreeView::mouseMoveEvent(QMouseEvent* event) {
    QTreeView::mouseMoveEvent(event);
    const QModelIndex idx = indexAt(event->pos());
    if (idx != hoveredIndex_) {
        hoveredIndex_ = idx;
        if (!motionEnabled()) {
            hoverOpacity_ = hoveredIndex_.isValid() ? 1.0 : 0.0;
            viewport()->update();
            return;
        }
        hoverAnim_->stop();
        hoverAnim_->setStartValue(0.25);
        hoverAnim_->setEndValue(hoveredIndex_.isValid() ? 1.0 : 0.0);
        hoverAnim_->start();
    }
}

void WorkspaceTreeView::leaveEvent(QEvent* event) {
    QTreeView::leaveEvent(event);
    hoveredIndex_ = QModelIndex();
    hoverAnim_->stop();
    hoverOpacity_ = 0.0;
    viewport()->update();
}

void WorkspaceTreeView::drawRow(QPainter* painter, const QStyleOptionViewItem& options, const QModelIndex& index) const {
    if (!index.isValid()) return;
    const auto& t = currentTheme();
    const double s = scaleFor(this);

    int depth = 0;
    QModelIndex cur = index.parent();
    const QModelIndex root = rootIndex();
    while (cur.isValid() && cur != root) {
        ++depth;
        cur = cur.parent();
    }

    const QRect rowRect(0, options.rect.top(), viewport()->width(), options.rect.height());
    const QRectF pillRect = QRectF(rowRect).adjusted(6.0 * s, 1.5 * s, -6.0 * s, -1.5 * s);
    const qreal radius = 6.0 * s;

    const QString path = filePathFor(index);
    const bool isDir = isDirFor(index);
    const bool isActive = !isDir && isActiveBook(path);
    const bool isOpen = !isDir && isOpenBook(path);
    const bool isSelected = selectionModel() && selectionModel()->isSelected(index);
    const bool isHovered = index == hoveredIndex_;

    painter->save();
    painter->setRenderHint(QPainter::Antialiasing, true);

    if (isActive) {
        painter->setPen(Qt::NoPen);
        painter->setBrush(t.accentSoft);
        painter->drawRoundedRect(pillRect, radius, radius);
        const qreal barW = 3.0 * s;
        const qreal barH = pillRect.height() - 10.0 * s;
        painter->setBrush(t.accent);
        painter->drawRoundedRect(QRectF(pillRect.left() + 1.5 * s, pillRect.center().y() - barH / 2.0, barW, barH),
                                 barW / 2.0, barW / 2.0);
    } else if (isSelected) {
        painter->setPen(Qt::NoPen);
        painter->setBrush(t.bgSelected);
        painter->drawRoundedRect(pillRect, radius, radius);
    } else if (isHovered && hoverOpacity_ > 0.01) {
        painter->setPen(Qt::NoPen);
        QColor hoverBg = t.bgHover;
        hoverBg.setAlpha(qRound(255 * hoverOpacity_));
        painter->setBrush(hoverBg);
        painter->drawRoundedRect(pillRect, radius, radius);
    }

    const qreal indentStep = 14.0 * s;
    qreal x = pillRect.left() + 8.0 * s + depth * indentStep;
    const qreal cy = pillRect.center().y();

    if (depth > 0) {
        painter->setPen(QPen(t.border, 1.0));
        for (int d = 0; d < depth; ++d) {
            const qreal gx = pillRect.left() + 14.0 * s + d * indentStep;
            painter->drawLine(QPointF(gx, rowRect.top()), QPointF(gx, rowRect.bottom()));
        }
    }

    const int chevronDim = qRound(12 * s);
    if (isDir) {
        const QRect chevronRect(qRound(x), qRound(cy - chevronDim / 2.0), chevronDim, chevronDim);
        (isExpanded(index) ? chevronDown_ : chevronRight_).paint(painter, chevronRect);
        x += chevronDim + 4.0 * s;
    } else {
        x += 4.0 * s;
    }

    const int iconDim = qRound(16 * s);
    const QRect iconRect(qRound(x), qRound(cy - iconDim / 2.0), iconDim, iconDim);
    if (isDir) {
        (isExpanded(index) ? folderOpenIcon_ : folderIcon_).paint(painter, iconRect);
    } else {
        xlsxIcon_.paint(painter, iconRect);
    }
    x = iconRect.right() + 7.0 * s;

    qreal rightLimit = pillRect.right() - 8.0 * s;
    if (isOpen) {
        const qreal dotD = isActive ? 6.5 * s : 5.5 * s;
        const QRectF dotRect(rightLimit - dotD, cy - dotD / 2.0, dotD, dotD);
        painter->setPen(Qt::NoPen);
        painter->setBrush(isActive ? t.accent : blendColor(t.accent, t.bgSidebar, 0.25));
        painter->drawEllipse(dotRect);
        rightLimit = dotRect.left() - 7.0 * s;
    }

    const QString fullName = index.data(Qt::DisplayRole).toString();
    QFont nameFont = font();
    nameFont.setPixelSize(qRound(12.8 * s));
    nameFont.setWeight((isActive || isSelected) ? QFont::DemiBold : (isDir ? QFont::Medium : QFont::Normal));
    const QFontMetrics nfm(nameFont);
    const qreal avail = qMax<qreal>(0, rightLimit - x);

    const bool hasXlsx = !isDir && fullName.endsWith(".xlsx", Qt::CaseInsensitive) && fullName.size() > 5;
    if (hasXlsx) {
        const QString base = fullName.chopped(5);
        const QString ext = fullName.right(5);
        QFont extFont = nameFont;
        extFont.setWeight(QFont::Normal);
        extFont.setPixelSize(qRound(11.5 * s));
        const QFontMetrics efm(extFont);
        const int extW = efm.horizontalAdvance(ext);
        const int baseAvail = qMax(0, qFloor(avail) - extW);
        const QString elidedBase = nfm.elidedText(base, Qt::ElideRight, baseAvail);

        painter->setFont(nameFont);
        painter->setPen(isActive ? t.accentText : t.textBody);
        painter->drawText(QRectF(x, pillRect.top(), baseAvail, pillRect.height()),
                          Qt::AlignLeft | Qt::AlignVCenter, elidedBase);

        const qreal extX = x + nfm.horizontalAdvance(elidedBase);
        if (extX + extW <= rightLimit + 2) {
            painter->setFont(extFont);
            painter->setPen(isActive ? t.accentMutedText : t.textFaint);
            painter->drawText(QRectF(extX, pillRect.top(), extW + 2, pillRect.height()),
                              Qt::AlignLeft | Qt::AlignVCenter, ext);
        }
    } else {
        painter->setFont(nameFont);
        painter->setPen(isActive ? t.accentText : (isDir ? t.textPrimary : t.textBody));
        painter->drawText(QRectF(x, pillRect.top(), avail, pillRect.height()),
                          Qt::AlignLeft | Qt::AlignVCenter,
                          nfm.elidedText(fullName, Qt::ElideRight, qFloor(avail)));
    }

    painter->restore();
}

// ── ThemeSettingsDialog (Mode Preview Cards + Accent Swatches + Custom Color) ─

class ThemeSettingsDialog::ModeCard final : public QPushButton {
public:
    ModeCard(bool darkMode, const QString& label, QWidget* parent)
        : QPushButton(parent), darkMode_(darkMode), label_(label) {
        setCursor(Qt::PointingHandCursor);
        setFlat(true);
        setAccessibleName(label);
        setCheckable(true);
        hoverAnim_ = new QVariantAnimation(this);
        hoverAnim_->setDuration(140);
        hoverAnim_->setEasingCurve(QEasingCurve::OutCubic);
        connect(hoverAnim_, &QVariantAnimation::valueChanged, this, [this](const QVariant& v) {
            hover_ = v.toReal();
            update();
        });
    }

    QSize sizeHint() const override {
        const double s = scaleFor(this);
        return QSize(qRound(136 * s), qRound(88 * s));
    }

protected:
    void enterEvent(QEvent* e) override {
        QPushButton::enterEvent(e);
        if (!motionEnabled()) { hover_ = 1.0; update(); return; }
        hoverAnim_->stop();
        hoverAnim_->setStartValue(hover_);
        hoverAnim_->setEndValue(1.0);
        hoverAnim_->start();
    }
    void leaveEvent(QEvent* e) override {
        QPushButton::leaveEvent(e);
        if (!motionEnabled()) { hover_ = 0.0; update(); return; }
        hoverAnim_->stop();
        hoverAnim_->setStartValue(hover_);
        hoverAnim_->setEndValue(0.0);
        hoverAnim_->start();
    }
    void paintEvent(QPaintEvent*) override {
        const auto& t = currentTheme();
        const double s = scaleFor(this);
        QPainter p(this);
        p.setRenderHint(QPainter::Antialiasing, true);

        const QRectF r = QRectF(rect()).adjusted(1.5, 1.5, -1.5, -1.5);
        const qreal rad = 10.0 * s;
        const bool active = isChecked();

        p.setPen(QPen(active ? t.accent : blendColor(t.borderControl, t.accentBorder, hover_), active ? 2.0 : 1.0));
        p.setBrush(active ? t.accentSoft : blendColor(t.bgCard, t.bgHover, hover_));
        p.drawRoundedRect(r, rad, rad);

        // Mini window preview illustration
        const QRectF mini(r.left() + 10.0 * s, r.top() + 9.0 * s, r.width() - 20.0 * s, r.height() - 36.0 * s);
        const QColor mBg = darkMode_ ? QColor("#111720") : QColor("#FFFFFF");
        const QColor mSide = darkMode_ ? QColor("#18202C") : QColor("#F1F5F9");
        const QColor mBorder = darkMode_ ? QColor("#2B3748") : QColor("#DDE4EC");
        const QColor mLine = darkMode_ ? QColor("#2A3647") : QColor("#E2E8F0");

        p.setPen(QPen(mBorder, 1.0));
        p.setBrush(mBg);
        p.drawRoundedRect(mini, 5.0 * s, 5.0 * s);

        // Mini sidebar
        const QRectF mSideRect(mini.left() + 1, mini.top() + 1, mini.width() * 0.28, mini.height() - 2);
        p.setPen(Qt::NoPen);
        p.setBrush(mSide);
        p.drawRoundedRect(mSideRect, 4.0 * s, 4.0 * s);

        // Mini accent bar + content lines
        p.setBrush(t.accent);
        p.drawRoundedRect(QRectF(mini.left() + 5.0 * s, mini.top() + 8.0 * s, mini.width() * 0.18, 4.0 * s), 2.0, 2.0);
        p.setBrush(mLine);
        p.drawRoundedRect(QRectF(mini.left() + 5.0 * s, mini.top() + 16.0 * s, mini.width() * 0.15, 3.0 * s), 1.5, 1.5);
        p.drawRoundedRect(QRectF(mini.left() + mini.width() * 0.36, mini.top() + 9.0 * s, mini.width() * 0.48, 4.0 * s), 2.0, 2.0);
        p.drawRoundedRect(QRectF(mini.left() + mini.width() * 0.36, mini.top() + 17.0 * s, mini.width() * 0.35, 3.0 * s), 1.5, 1.5);
        p.drawRoundedRect(QRectF(mini.left() + mini.width() * 0.36, mini.top() + 24.0 * s, mini.width() * 0.42, 3.0 * s), 1.5, 1.5);

        // Label + icon row at bottom
        const QRectF footer(r.left() + 10.0 * s, mini.bottom() + 4.0 * s, r.width() - 20.0 * s, r.bottom() - mini.bottom() - 6.0 * s);
        const QIcon modeIcon = tintedIcon(darkMode_ ? QStringLiteral(":/window-chrome/moon.svg") : QStringLiteral(":/window-chrome/sun.svg"),
                                          active ? t.accent : t.textSecondary, 16);
        const int ic = qRound(14 * s);
        modeIcon.paint(&p, QRect(qRound(footer.left()), qRound(footer.center().y() - ic / 2.0), ic, ic));

        QFont lf = font();
        lf.setPixelSize(qRound(12.5 * s));
        lf.setWeight(active ? QFont::DemiBold : QFont::Medium);
        p.setFont(lf);
        p.setPen(active ? t.accentText : t.textBody);
        p.drawText(footer.adjusted(ic + 6.0 * s, 0, 0, 0), Qt::AlignLeft | Qt::AlignVCenter, label_);

        // Active check dot on top-right
        if (active) {
            const qreal d = 14.0 * s;
            const QRectF chk(r.right() - d - 7.0 * s, r.top() + 6.0 * s, d, d);
            p.setPen(Qt::NoPen);
            p.setBrush(t.accent);
            p.drawEllipse(chk);
            p.setPen(QPen(t.dark && t.accent.lightnessF() > 0.62 ? QColor("#0B1117") : QColor("#FFFFFF"), 1.7 * s, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin));
            p.drawLine(QPointF(chk.left() + 3.6 * s, chk.center().y() + 0.3 * s),
                       QPointF(chk.center().x() - 0.6 * s, chk.bottom() - 3.6 * s));
            p.drawLine(QPointF(chk.center().x() - 0.6 * s, chk.bottom() - 3.6 * s),
                       QPointF(chk.right() - 3.4 * s, chk.top() + 4.2 * s));
        }
    }

private:
    bool darkMode_;
    QString label_;
    qreal hover_ = 0.0;
    QVariantAnimation* hoverAnim_ = nullptr;
};

class ThemeSettingsDialog::SwatchButton final : public QPushButton {
public:
    SwatchButton(const QString& id, const QString& label, const QColor& color, bool isCustom, QWidget* parent)
        : QPushButton(parent), id_(id), color_(color), isCustom_(isCustom) {
        setCursor(Qt::PointingHandCursor);
        setFlat(true);
        setCheckable(true);
        setToolTip(label);
        setAccessibleName(label);
        const double s = scaleFor(this);
        setFixedSize(qRound(32 * s), qRound(32 * s));
        hoverAnim_ = new QVariantAnimation(this);
        hoverAnim_->setDuration(130);
        hoverAnim_->setEasingCurve(QEasingCurve::OutCubic);
        connect(hoverAnim_, &QVariantAnimation::valueChanged, this, [this](const QVariant& v) {
            hover_ = v.toReal();
            update();
        });
    }

    QString id() const { return id_; }
    void setColor(const QColor& c) { color_ = c; update(); }

protected:
    void enterEvent(QEvent* e) override {
        QPushButton::enterEvent(e);
        if (!motionEnabled()) { hover_ = 1.0; update(); return; }
        hoverAnim_->stop();
        hoverAnim_->setStartValue(hover_);
        hoverAnim_->setEndValue(1.0);
        hoverAnim_->start();
    }
    void leaveEvent(QEvent* e) override {
        QPushButton::leaveEvent(e);
        if (!motionEnabled()) { hover_ = 0.0; update(); return; }
        hoverAnim_->stop();
        hoverAnim_->setStartValue(hover_);
        hoverAnim_->setEndValue(0.0);
        hoverAnim_->start();
    }
    void paintEvent(QPaintEvent*) override {
        const auto& t = currentTheme();
        const double s = scaleFor(this);
        QPainter p(this);
        p.setRenderHint(QPainter::Antialiasing, true);
        const QPointF c = QRectF(rect()).center();
        const qreal baseR = 11.0 * s + 1.0 * s * hover_;

        if (isChecked()) {
            p.setPen(QPen(color_.isValid() ? color_ : t.accent, 2.0 * s));
            p.setBrush(Qt::NoBrush);
            p.drawEllipse(c, baseR + 3.2 * s, baseR + 3.2 * s);
        }

        if (isCustom_ && !isChecked()) {
            QConicalGradient rainbow(c, 0);
            rainbow.setColorAt(0.0, QColor("#EF4444"));
            rainbow.setColorAt(0.2, QColor("#F59E0B"));
            rainbow.setColorAt(0.4, QColor("#10B981"));
            rainbow.setColorAt(0.6, QColor("#3B82F6"));
            rainbow.setColorAt(0.8, QColor("#8B5CF6"));
            rainbow.setColorAt(1.0, QColor("#EF4444"));
            p.setPen(QPen(QBrush(rainbow), 2.2 * s));
            p.setBrush(t.bgCard);
            p.drawEllipse(c, baseR, baseR);
            p.setPen(QPen(t.textSecondary, 1.6 * s, Qt::SolidLine, Qt::RoundCap));
            p.drawLine(QPointF(c.x() - 4.0 * s, c.y()), QPointF(c.x() + 4.0 * s, c.y()));
            p.drawLine(QPointF(c.x(), c.y() - 4.0 * s), QPointF(c.x(), c.y() + 4.0 * s));
        } else {
            p.setPen(QPen(QColor(0, 0, 0, t.dark ? 60 : 30), 1.0));
            p.setBrush(color_);
            p.drawEllipse(c, baseR, baseR);
            if (isChecked()) {
                const QColor checkColor = color_.lightnessF() > 0.62 ? QColor("#0B1117") : QColor("#FFFFFF");
                p.setPen(QPen(checkColor, 2.0 * s, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin));
                p.drawLine(QPointF(c.x() - 4.0 * s, c.y() + 0.4 * s), QPointF(c.x() - 1.0 * s, c.y() + 3.4 * s));
                p.drawLine(QPointF(c.x() - 1.0 * s, c.y() + 3.4 * s), QPointF(c.x() + 4.5 * s, c.y() - 3.0 * s));
            }
        }
    }

private:
    QString id_;
    QColor color_;
    bool isCustom_ = false;
    qreal hover_ = 0.0;
    QVariantAnimation* hoverAnim_ = nullptr;
};

ThemeSettingsDialog::ThemeSettingsDialog(OnThemeChanged onChanged, QWidget* parent)
    : QDialog(parent, Qt::Tool | Qt::FramelessWindowHint), onChanged_(std::move(onChanged)) {
    setAttribute(Qt::WA_DeleteOnClose);
    setAttribute(Qt::WA_TranslucentBackground);
    setObjectName("themeSettingsDialog");
    setWindowTitle(QStringLiteral("外观设置"));

    const double s = scaleFor(this);
    const int shadowPad = qRound(18 * s);
    auto* outer = new QVBoxLayout(this);
    outer->setContentsMargins(shadowPad, shadowPad, shadowPad, shadowPad);
    outer->setSpacing(0);

    auto* card = new QFrame(this);
    card->setObjectName("themeSettingsCard");
    auto* shadow = new QGraphicsDropShadowEffect(card);
    shadow->setBlurRadius(qRound(30 * s));
    shadow->setOffset(0, qRound(10 * s));
    shadow->setColor(QColor(0, 0, 0, currentTheme().dark ? 115 : 46));
    card->setGraphicsEffect(shadow);
    outer->addWidget(card);

    auto* layout = new QVBoxLayout(card);
    layout->setContentsMargins(qRound(16 * s), qRound(14 * s), qRound(16 * s), qRound(14 * s));
    layout->setSpacing(qRound(14 * s));

    // Header
    auto* header = new QHBoxLayout;
    header->setSpacing(8);
    auto* titleCol = new QVBoxLayout;
    titleCol->setSpacing(2);
    auto* title = new QLabel(QStringLiteral("外观设置"), card);
    title->setObjectName("settingsTitle");
    auto* sub = new QLabel(QStringLiteral("外观模式与主题色实时生效"), card);
    sub->setObjectName("settingsSubtitle");
    titleCol->addWidget(title);
    titleCol->addWidget(sub);
    header->addLayout(titleCol, 1);

    closeBtn_ = new QToolButton(card);
    closeBtn_->setObjectName("settingsCloseBtn");
    closeBtn_->setCursor(Qt::PointingHandCursor);
    closeBtn_->setToolTip(QStringLiteral("关闭 (Esc)"));
    closeBtn_->setAccessibleName(QStringLiteral("关闭设置"));
    connect(closeBtn_, &QToolButton::clicked, this, &QDialog::reject);
    header->addWidget(closeBtn_, 0, Qt::AlignTop);
    layout->addLayout(header);

    // Mode section
    auto* modeLabel = new QLabel(QStringLiteral("外观模式"), card);
    modeLabel->setObjectName("settingsSectionLabel");
    layout->addWidget(modeLabel);

    auto* modeRow = new QHBoxLayout;
    modeRow->setSpacing(qRound(10 * s));
    lightCard_ = new ModeCard(false, QStringLiteral("亮色"), card);
    darkCard_ = new ModeCard(true, QStringLiteral("暗色"), card);
    lightCard_->setMinimumSize(qRound(132 * s), qRound(88 * s));
    darkCard_->setMinimumSize(qRound(132 * s), qRound(88 * s));
    connect(lightCard_, &QPushButton::clicked, this, [this] {
        if (onChanged_) onChanged_(false, currentTheme().accentId);
        syncFromTheme();
    });
    connect(darkCard_, &QPushButton::clicked, this, [this] {
        if (onChanged_) onChanged_(true, currentTheme().accentId);
        syncFromTheme();
    });
    modeRow->addWidget(lightCard_, 1);
    modeRow->addWidget(darkCard_, 1);
    layout->addLayout(modeRow);

    // Accent color section
    auto* accentHeader = new QHBoxLayout;
    auto* accentLabel = new QLabel(QStringLiteral("主题色"), card);
    accentLabel->setObjectName("settingsSectionLabel");
    accentBadge_ = new QLabel(card);
    accentBadge_->setObjectName("settingsAccentBadge");
    accentHeader->addWidget(accentLabel);
    accentHeader->addStretch(1);
    accentHeader->addWidget(accentBadge_);
    layout->addLayout(accentHeader);

    auto* swatchRow = new QHBoxLayout;
    swatchRow->setSpacing(qRound(8 * s));
    for (const auto& preset : accentPresets()) {
        auto* swatch = new SwatchButton(preset.id, preset.label,
                                        currentTheme().dark ? preset.darkColor : preset.lightColor, false, card);
        connect(swatch, &QPushButton::clicked, this, [this, id = preset.id] {
            if (onChanged_) onChanged_(currentTheme().dark, id);
            syncFromTheme();
        });
        swatches_.append(swatch);
        swatchRow->addWidget(swatch);
    }
    customSwatch_ = new SwatchButton(QStringLiteral("custom"), QStringLiteral("自定义主题色…"),
                                     currentTheme().accent, true, card);
    connect(customSwatch_, &QPushButton::clicked, this, [this] {
        pickingColor_ = true;
        const QColor picked = QColorDialog::getColor(currentTheme().accent, this, QStringLiteral("选择自定义主题色"));
        pickingColor_ = false;
        if (picked.isValid()) {
            if (onChanged_) onChanged_(currentTheme().dark, picked.name(QColor::HexRgb).toUpper());
            syncFromTheme();
        }
        activateWindow();
    });
    swatchRow->addWidget(customSwatch_);
    swatchRow->addStretch(1);
    layout->addLayout(swatchRow);

    // Divider & footer
    auto* sep = new QFrame(card);
    sep->setObjectName("settingsSep");
    sep->setFrameShape(QFrame::HLine);
    layout->addWidget(sep);

    auto* footer = new QHBoxLayout;
    auto* resetBtn = new QPushButton(QStringLiteral("恢复默认"), card);
    resetBtn->setObjectName("settingsResetBtn");
    resetBtn->setCursor(Qt::PointingHandCursor);
    connect(resetBtn, &QPushButton::clicked, this, [this] {
        if (onChanged_) onChanged_(false, QStringLiteral("emerald"));
        syncFromTheme();
    });
    auto* escHint = new QLabel(QStringLiteral("Esc 关闭"), card);
    escHint->setObjectName("settingsHint");
    footer->addWidget(resetBtn);
    footer->addStretch(1);
    footer->addWidget(escHint);
    layout->addLayout(footer);

    syncFromTheme();
    adjustSize();
}

void ThemeSettingsDialog::syncFromTheme() {
    const auto& t = currentTheme();
    lightCard_->setChecked(!t.dark);
    darkCard_->setChecked(t.dark);
    lightCard_->update();
    darkCard_->update();
    accentBadge_->setText(t.accentLabel);
    if (closeBtn_) {
        closeBtn_->setIcon(tintedIcon(QStringLiteral(":/window-chrome/tab-close.svg"), t.textSecondary, 16));
    }
    bool isPreset = false;
    const auto& presets = accentPresets();
    for (int i = 0; i < swatches_.size() && i < presets.size(); ++i) {
        swatches_[i]->setColor(t.dark ? presets[i].darkColor : presets[i].lightColor);
        const bool match = presets[i].id.compare(t.accentId, Qt::CaseInsensitive) == 0;
        swatches_[i]->setChecked(match);
        swatches_[i]->update();
        if (match) isPreset = true;
    }
    customSwatch_->setColor(t.accent);
    customSwatch_->setChecked(!isPreset);
    customSwatch_->update();
}

void ThemeSettingsDialog::popupNear(const QPoint& globalBottomLeft) {
    adjustSize();
    const double s = scaleFor(this);
    QPoint target(globalBottomLeft.x() - qRound(8 * s), globalBottomLeft.y() - height() + qRound(12 * s));
    if (auto* screen = QApplication::screenAt(globalBottomLeft)) {
        const QRect avail = screen->availableGeometry();
        target.setX(qBound(avail.left(), target.x(), avail.right() - width()));
        target.setY(qBound(avail.top(), target.y(), avail.bottom() - height()));
    }
    if (motionEnabled()) {
        setWindowOpacity(0.0);
        move(target.x(), target.y() + qRound(10 * s));
        show();
        auto* group = new QParallelAnimationGroup(this);
        auto* fade = new QPropertyAnimation(this, "windowOpacity", group);
        fade->setDuration(150);
        fade->setStartValue(0.0);
        fade->setEndValue(1.0);
        fade->setEasingCurve(QEasingCurve::OutCubic);
        auto* slide = new QPropertyAnimation(this, "pos", group);
        slide->setDuration(165);
        slide->setStartValue(QPoint(target.x(), target.y() + qRound(10 * s)));
        slide->setEndValue(target);
        slide->setEasingCurve(QEasingCurve::OutCubic);
        group->start(QAbstractAnimation::DeleteWhenStopped);
    } else {
        move(target);
        show();
    }
    activateWindow();
    setFocus();
}

void ThemeSettingsDialog::changeEvent(QEvent* event) {
    QDialog::changeEvent(event);
    if (event->type() == QEvent::ActivationChange) {
        if (isActiveWindow()) {
            wasActive_ = true;
        } else if (wasActive_ && !pickingColor_ && isVisible()) {
            reject();
        }
    }
}

} // namespace ExcelUi
